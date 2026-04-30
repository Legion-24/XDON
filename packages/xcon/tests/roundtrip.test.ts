import { parse } from '../src/parser';
import { stringify } from '../src/stringifier';

interface Fixture {
  name: string;
  xcon: string;
  json: unknown;
}

const FIXTURES: Fixture[] = [
  {
    name: 'basic',
    xcon: '(name,age,active)\nalice:{Alice,30,true}\nbob:{Bob,25,false}\n',
    json: {
      alice: { name: 'Alice', age: 30, active: true },
      bob: { name: 'Bob', age: 25, active: false },
    },
  },
  {
    name: 'no-header',
    xcon: '{Alice,30,true}\n{Bob,25,false}\n',
    json: [
      ['Alice', 30, true],
      ['Bob', 25, false],
    ],
  },
  {
    name: 'arrays',
    xcon: '(name,tags[],verified)\nalice:{Alice,[admin,developer],true}\nbob:{Bob,[user],false}\n',
    json: {
      alice: { name: 'Alice', tags: ['admin', 'developer'], verified: true },
      bob: { name: 'Bob', tags: ['user'], verified: false },
    },
  },
  {
    name: 'nested',
    xcon: '(name,address:(city,zip))\nalice:{Alice,{NYC,10001}}\nbob:{Bob,{LA,90001}}\n',
    json: {
      alice: { name: 'Alice', address: { city: 'NYC', zip: 10001 } },
      bob: { name: 'Bob', address: { city: 'LA', zip: 90001 } },
    },
  },
  {
    name: 'types',
    xcon: '(string,integer,float,boolean,null_val)\nexample:{hello,42,3.14,true,null}\n',
    json: {
      example: { string: 'hello', integer: 42, float: 3.14, boolean: true, null_val: null },
    },
  },
  {
    name: 'escaped',
    xcon: '(name,description)\nitem1:{Widget,"A \\, B, and C"}\nitem2:{Gadget,"Quote: \\"Hello\\""}\n',
    json: {
      item1: { name: 'Widget', description: 'A , B, and C' },
      item2: { name: 'Gadget', description: 'Quote: "Hello"' },
    },
  },
  {
    name: 'empty-values',
    xcon: '(name,email,phone)\nuser1:{Alice,,555-1234}\nuser2:{Bob,bob@example.com,user@phone}\n',
    json: {
      user1: { name: 'Alice', email: '', phone: '555-1234' },
      user2: { name: 'Bob', email: 'bob@example.com', phone: 'user@phone' },
    },
  },
];

describe('Round-trip Integration Tests', () => {
  FIXTURES.forEach(({ name, xcon, json }) => {
    it(`should parse fixture to expected JSON: ${name}`, () => {
      expect(parse(xcon)).toEqual(json);
    });

    it(`should stringify and re-parse fixture: ${name}`, () => {
      const parsed = parse(xcon);
      const reparsed = parse(stringify(parsed));
      expect(reparsed).toEqual(parsed);
    });
  });
});
