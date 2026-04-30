import { parse, parseToAST } from './parser';
import { stringify } from './stringifier';

export function toJSON(lmon: string): string {
  const parsed = parse(lmon);
  return JSON.stringify(parsed);
}

export function fromJSON(json: string): string {
  const parsed = JSON.parse(json);
  return stringify(parsed);
}

export { parse, parseToAST } from './parser';
