import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://forge:forge_change_me@localhost:5432/forge";

const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });
export { queryClient };
