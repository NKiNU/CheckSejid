import { app } from "./app.ts";
import { accessSecret } from "./modules/identity/auth.ts";

accessSecret(); // fail fast on a missing or weak signing secret

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
