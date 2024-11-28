import { defineMiddleware } from "astro:middleware";

declare global {
  namespace App {
    interface Locals {
      person: {
        name: string;
        age: number;
      };
    }
  }
}

// `context` and `next` are automatically typed
export const onRequest = defineMiddleware((context, next) => {
  context.locals.person = {
    name: "John Doe",
    age: 25,
  };
  return next();
});
