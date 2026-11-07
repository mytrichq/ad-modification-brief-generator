import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

export function loadSchema(name) {
  return JSON.parse(readFileSync(path.join(PATHS.schemas, `${name}.json`), 'utf8'));
}

export function validate(value, schema, at = '$') {
  const errors = [];
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const expected = schema.type;

  if (expected === 'integer') {
    if (!Number.isInteger(value)) errors.push(`${at}: expected integer`);
  } else if (expected && expected !== type) {
    errors.push(`${at}: expected ${expected}, got ${type}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: "${value}" is not one of ${schema.enum.join(', ')}`);

  if (expected === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${at}.${key}: missing`);
    }
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validate(v, schema.properties[key], `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: unexpected field`);
    }
  }
  if (expected === 'array' && schema.items) {
    value.forEach((item, i) => errors.push(...validate(item, schema.items, `${at}[${i}]`)));
  }
  return errors;
}

export function assertValid(value, schemaName) {
  const errors = validate(value, loadSchema(schemaName));
  if (errors.length) {
    const err = new Error(`Answer does not match the "${schemaName}" schema:\n  ${errors.slice(0, 10).join('\n  ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return value;
}
