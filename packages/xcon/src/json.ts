import { parse, parseToAST } from './parser';
import { stringify } from './stringifier';

export function toJSON(xcon: string): string {
  const parsed = parse(xcon);
  return JSON.stringify(parsed);
}

export function fromJSON(json: string): string {
  const parsed = JSON.parse(json);
  return stringify(parsed);
}

export { parse, parseToAST } from './parser';
