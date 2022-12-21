import { jest } from "@jest/globals"

import { CalledWithMock } from './Mock';
import { Matcher, MatchersOrLiterals } from './Matchers';

interface CalledWithStackItem<T, Y extends any[]> {
    args: MatchersOrLiterals<Y>;
    calledWithFn: jest.Mock<(...args: Y) => T>;
}

interface JestAsymmetricMatcher {
    asymmetricMatch(...args: any[]): boolean;
}
function isJestAsymmetricMatcher(obj: any): obj is JestAsymmetricMatcher {
    return !!obj && typeof obj === 'object' && 'asymmetricMatch' in obj && typeof obj.asymmetricMatch === 'function';
}

const checkCalledWith = <T, Y extends any[]>(calledWithStack: CalledWithStackItem<T, Y>[], actualArgs: Y): T => {
    const calledWithInstance = calledWithStack.find(instance =>
        instance.args.every((matcher, i) => {
            if (matcher instanceof Matcher) {
                return matcher.asymmetricMatch(actualArgs[i]);
            }

            if (isJestAsymmetricMatcher(matcher)) {
                return matcher.asymmetricMatch(actualArgs[i]);
            }

            return actualArgs[i] === matcher;
        })
    );

    // @ts-ignore cannot return undefined, but this will fail the test if there is an expectation which is what we want
    return calledWithInstance ? calledWithInstance.calledWithFn(...actualArgs) : undefined;
};

export const calledWithFn = <T, Y extends any[]>(): CalledWithMock<T, Y> => {
    const fn: jest.Mock<(...args: Y) => T> = jest.fn();
    let calledWithStack: CalledWithStackItem<T, Y>[] = [];

    (fn as CalledWithMock<T, Y>).calledWith = (...args) => {
        // We create new function to delegate any interactions (mockReturnValue etc.) to for this set of args.
        // If that set of args is matched, we just call that jest.fn() for the result.
        const calledWithFn = jest.fn();
        if (!fn.getMockImplementation()) {
            // Our original function gets a mock implementation which handles the matching
            fn.mockImplementation((...args: Y) => checkCalledWith(calledWithStack, args));
            calledWithStack = [];
        }
        calledWithStack.unshift({ args, calledWithFn });

        return calledWithFn;
    };

    return fn as CalledWithMock<T, Y>;
};

export default calledWithFn;
