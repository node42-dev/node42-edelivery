/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { execSync } from "child_process";

function getGlobalBin(cmd) {
  try {
    const prefix = execSync("npm prefix -g", { encoding: "utf8" }).trim();
    return `${prefix}/bin/${cmd}`;
  } catch {
    return null;
  }
}

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: "pipe" }).toString();
}

const globalBin = getGlobalBin("n42-edelivery");
const CLI = globalBin ? globalBin : "npx n42-edelivery";

try {
  // 1. binary exists
  const version = run(`${CLI} --version`);
  if (!version.trim()) throw new Error("No version output");

  // 2. help works
  run(`${CLI} help`);

  // 3. command tree exists
  run(`${CLI} validate --help`);
  run(`${CLI} send --help`);

  console.log("CLI validation OK");
} catch(e) {
  console.error("CLI validation FAILED");
  console.error(e.message);
  process.exit(1);
}