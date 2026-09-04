import type { FastifyPluginAsync } from "fastify";

/** Tiny local fp helper so we don't need fastify-plugin as a dep. */
export default function fp<T extends FastifyPluginAsync>(plugin: T): T {
  return plugin;
}
