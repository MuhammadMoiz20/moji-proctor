import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

function getPrismaInstance(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    if (Reflect.has(target as object, prop)) {
      return Reflect.get(target as object, prop, receiver);
    }
    const instance = getPrismaInstance();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  set(target, prop, value, receiver) {
    return Reflect.set(target as object, prop, value, receiver);
  },
  has(target, prop) {
    if (Reflect.has(target as object, prop)) {
      return true;
    }
    const instance = getPrismaInstance() as any;
    return prop in instance;
  },
  getOwnPropertyDescriptor(target, prop) {
    if (Reflect.has(target as object, prop)) {
      return Reflect.getOwnPropertyDescriptor(target as object, prop);
    }

    const instance = getPrismaInstance() as any;
    const descriptor = Reflect.getOwnPropertyDescriptor(instance, prop);
    if (!descriptor) {
      return undefined;
    }

    return {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      writable: true,
      value: (instance as any)[prop],
    };
  },
  ownKeys(target) {
    const instance = getPrismaInstance() as any;
    const targetKeys = Reflect.ownKeys(target as object);
    const instanceKeys = Reflect.ownKeys(instance);
    return Array.from(new Set([...targetKeys, ...instanceKeys]));
  },
});
