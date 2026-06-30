import { body, param } from 'express-validator';

const PRISMA_ID_PATTERN = /^c[a-z0-9]{20,}$/i;

export const prismaId = (name, source = 'body') => {
  const chain = source === 'param' ? param(name) : body(name);
  return chain
    .trim()
    .notEmpty()
    .withMessage(`Valid ${name} required`)
    .matches(PRISMA_ID_PATTERN)
    .withMessage(`Invalid ${name} ID`);
};
