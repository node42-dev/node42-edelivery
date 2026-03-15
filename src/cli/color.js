/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

export const C = {
  RESET:      '\x1b[0m',
  BOLD:       '\x1b[1m',
  DIM:        '\x1b[2m',
  STRIKE:     '\x1b[9m',
  RED:        '\x1b[91m',
  DARK_RED:   '\x1b[31m',
  GREEN:      '\x1b[92m',
  DARK_GREEN: '\x1b[32m',
  YELLOW:     '\x1b[93m',
  BLUE:       '\x1b[94m',
  ORANGE:     '\x1b[38;5;214m',
  GRAY:       '\x1b[38;5;244m',
  WHITE:      '\x1b[97m',
  BLACK:      '\x1b[30m',
  BG_YELLOW:  '\x1b[43m',
  BG_RED:     '\x1b[41m',
};

export const c = (color, text) => `${color}${text}${C.RESET}`;
