import { jest } from "@jest/globals"
import calledWithFn from './CalledWithFn';
import { MatchersOrLiterals } from './Matchers';
import { DeepPartial } from 'ts-essentials';

type ProxiedProperty = string | number | symbol;

export interface GlobalConfig {
    // ignoreProps is required when we don't want to return anything for a mock (for example, when mocking a promise).
    ignoreProps?: ProxiedProperty[];
}

const DEFAULT_CONFIG: GlobalConfig = {
    ignoreProps: ['then'],
};

let GLOBAL_CONFIG = DEFAULT_CONFIG;

export const JestMockExtended = {
    DEFAULT_CONFIG,
    configure: (config: GlobalConfig) => {
        // Shallow merge so they can override anything they want.
        GLOBAL_CONFIG = { ...DEFAULT_CONFIG, ...config };
    },
    resetConfig: () => {
        GLOBAL_CONFIG = DEFAULT_CONFIG;
    },
};

export interface CalledWithMock<T, Y extends any[]> extends jest.Mock<(...args: Y) => T> {
    calledWith: (...args: Y | MatchersOrLiterals<Y>) => jest.Mock<(...args: Y) => T>;
}


// export interface CalledWithMock<T, Y extends any[]> extends jest.Mock<T, Y> {
//     calledWith: (...args: Y | MatchersOrLiterals<Y>) => jest.Mock<T, Y>;
// }

export type MockProxy<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer B ? CalledWithMock<B, A> : T[K];
} &
    T;

export type DeepMockProxy<T> = {
    // This supports deep mocks in the else branch
    [K in keyof T]: T[K] extends (...args: infer A) => infer B ? CalledWithMock<B, A> : DeepMockProxy<T[K]>;
} &
    T;

export type DeepMockProxyWithFuncPropSupport<T> = {
    // This supports deep mocks in the else branch
    [K in keyof T]: T[K] extends (...args: infer A) => infer B ? CalledWithMock<B, A> & DeepMockProxy<T[K]> : DeepMockProxy<T[K]>;
} &
    T;

export interface MockOpts {
    deep?: boolean;
}

export const mockClear = (mock: MockProxy<any>) => {
    for (let key of Object.keys(mock)) {
        if (mock[key] === null || mock[key] === undefined) {
            continue;
        }

        if (mock[key]._isMockObject) {
            mockClear(mock[key]);
        }

        if (mock[key]._isMockFunction) {
            mock[key].mockClear();
        }
    }

    // This is a catch for if they pass in a jest.fn()
    if (!mock._isMockObject) {
        return mock.mockClear();
    }
};

export const mockReset = (mock: MockProxy<any>) => {
    for (let key of Object.keys(mock)) {
        if (mock[key] === null || mock[key] === undefined) {
            continue;
        }

        if (mock[key]._isMockObject) {
            mockReset(mock[key]);
        }
        if (mock[key]._isMockFunction) {
            mock[key].mockReset();
        }
    }

    // This is a catch for if they pass in a jest.fn()
    // Worst case, we will create a jest.fn() (since this is a proxy)
    // below in the get and call mockReset on it
    if (!mock._isMockObject) {
        return mock.mockReset();
    }
};

export function mockDeep<T>(opts: { funcPropSupport: true }, mockImplementation?: DeepPartial<T>): DeepMockProxyWithFuncPropSupport<T>;
export function mockDeep<T>(mockImplementation?: DeepPartial<T>): DeepMockProxy<T>;
export function mockDeep(arg1: any, arg2?: any) {
    return mock(arg1 && 'funcPropSupport' in arg1 ? arg2 : arg1, { deep: true });
}

const overrideMockImp = (obj: DeepPartial<any>, opts?: MockOpts) => {
    const proxy = new Proxy<MockProxy<any>>(obj, handler(opts));
    for (let name of Object.keys(obj)) {
        if (typeof obj[name] === 'object' && obj[name] !== null) {
            proxy[name] = overrideMockImp(obj[name], opts);
        } else {
            proxy[name] = obj[name];
        }
    }

    return proxy;
};

const handler = (opts?: MockOpts) => ({
    ownKeys(target: MockProxy<any>) {
        return Reflect.ownKeys(target);
    },

    set: (obj: MockProxy<any>, property: ProxiedProperty, value: any) => {
        // @ts-ignore All of these ignores are due to https://github.com/microsoft/TypeScript/issues/1863
        obj[property] = value;
        return true;
    },

    get: (obj: MockProxy<any>, property: ProxiedProperty) => {
        let fn = calledWithFn();

        // @ts-ignore
        if (!(property in obj)) {
            if (GLOBAL_CONFIG.ignoreProps?.includes(property)) {
                return undefined;
            }
            // Jest's internal equality checking does some wierd stuff to check for iterable equality
            if (property === Symbol.iterator) {
                // @ts-ignore
                return obj[property];
            }
            // So this calls check here is totally not ideal - jest internally does a
            // check to see if this is a spy - which we want to say no to, but blindly returning
            // an proxy for calls results in the spy check returning true. This is another reason
            // why deep is opt in.
            if (opts?.deep && property !== 'calls') {
                // @ts-ignore
                obj[property] = new Proxy<MockProxy<any>>(fn, handler(opts));
                // @ts-ignore
                obj[property]._isMockObject = true;
            } else {
                // @ts-ignore
                obj[property] = calledWithFn();
            }
        }

        // @ts-ignore
        if (obj instanceof Date && typeof obj[property] === 'function') {
            // @ts-ignore
            return obj[property].bind(obj);
        }

        // @ts-ignore
        return obj[property];
    },
});

const mock = <T, MockedReturn extends MockProxy<T> & T = MockProxy<T> & T>(
    mockImplementation: DeepPartial<T> = {} as DeepPartial<T>,
    opts?: MockOpts
): MockedReturn => {
    // @ts-ignore private
    mockImplementation!._isMockObject = true;
    return overrideMockImp(mockImplementation, opts);
};

export const mockFn = <
    T extends Function,
    A extends any[] = T extends (...args: infer AReal) => any ? AReal : any[],
    R = T extends (...args: any) => infer RReal ? RReal : any
>(): CalledWithMock<R, A> & T => {
    // @ts-ignore
    return calledWithFn();
};

export const stub = <T extends object>(): T => {
    return new Proxy<T>({} as T, {
        get: (obj, property: ProxiedProperty) => {
            if (property in obj) {
                // @ts-ignore
                return obj[property];
            }
            return jest.fn();
        },
    });
};

export default mock;
