/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: Apache-2.0
*/

export function getParticipantValue(identifier) {
  return identifier?.includes('::') ? identifier.split('::')[1] : identifier;
}

export function checkRequired(context) {
  const missing = [];
  if (!context.senderId)   missing.push('senderId');
  if (!context.receiverId) missing.push('receiverId');
  if (!context.senderCountry) missing.push('senderCountry');
  return missing;
}

export function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === dateStr;
}

export function normalizeFilename(filename) {
  return filename.toLowerCase().replace(/[\s.]/g, '_');
}