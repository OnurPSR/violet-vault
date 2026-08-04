import { chmod, stat } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin") process.exit(0);

const helper = path.resolve(
  "node_modules",
  "node-pty",
  "prebuilds",
  `darwin-${process.arch}`,
  "spawn-helper",
);

try {
  const metadata = await stat(helper);
  await chmod(helper, metadata.mode | 0o111);
  console.log(`Made node-pty spawn-helper executable: ${helper}`);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.warn(`node-pty spawn-helper was not found for ${process.platform}-${process.arch}.`);
  } else {
    throw error;
  }
}
