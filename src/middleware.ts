import { defineMiddleware } from "astro:middleware";

// `context` and `next` are automatically typed
export const onRequest = defineMiddleware((context, next) => {
  context.locals.person = {
    name: "John Doe",
    age: 25,
  };
  return next();
});
