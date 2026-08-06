import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const frontendRoot = process.cwd();
const sources = [
  resolve(frontendRoot, 'public'),
  resolve(frontendRoot, '.next/static'),
];
const destinations = [
  resolve(frontendRoot, '.next/standalone/frontend/public'),
  resolve(frontendRoot, '.next/standalone/frontend/.next/static'),
];
const standaloneServer = resolve(
  frontendRoot,
  '.next/standalone/frontend/server.js',
);

for (const requiredPath of [standaloneServer, ...sources]) {
  if (!existsSync(requiredPath)) {
    throw new Error(
      `Missing production build artifact: ${requiredPath}. Run npm run build first.`,
    );
  }
}

for (const [source, destination] of sources.map((source, index) => [
  source,
  destinations[index],
])) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}
