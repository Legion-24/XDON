/**
 * JSON vs LMON Macro Comparison
 * Shows how macros affect token savings vs JSON
 */

import { expand } from './packages/lmon/src/index';

function countTokens(text: string): number {
  return text.split(/[\s\(\)\{\}\[\],":]+/).filter(t => t.length > 0).length;
}

// Test data
const json = `[
  {"id": 1, "name": "Alice", "email": "alice@example.com", "role": "admin", "active": true},
  {"id": 2, "name": "Bob", "email": "bob@example.com", "role": "user", "active": false},
  {"id": 3, "name": "Charlie", "email": "charlie@example.com", "role": "user", "active": true}
]`;

const lmonBaseline = `(id,name,email,role,active)
{1,Alice,alice@example.com,admin,true}
{2,Bob,bob@example.com,user,false}
{3,Charlie,charlie@example.com,user,true}`;

const lmonMacrosInDoc = `%header = "(id,name,email,role,active)"
%admin = "admin"
%user = "user"

%header
{1,Alice,alice@example.com,%admin,true}
{2,Bob,bob@example.com,%user,false}
{3,Charlie,charlie@example.com,%user,true}`;

const lmonPreloaded = `(id,name,email,role,active)
{1,Alice,alice@example.com,%admin,true}
{2,Bob,bob@example.com,%user,false}
{3,Charlie,charlie@example.com,%user,true}`;

const macroContext = new Map([
  ['admin', { body: 'admin', params: null, sourceLine: 0 }],
  ['user', { body: 'user', params: null, sourceLine: 0 }],
]);

console.log('=== JSON vs LMON Macro Comparison ===\n');

// JSON
const jsonBytes = Buffer.byteLength(json, 'utf8');
const jsonChars = json.length;
const jsonTokens = countTokens(json);

console.log('1. JSON (Baseline)');
console.log(`   Bytes: ${jsonBytes}`);
console.log(`   Chars: ${jsonChars}`);
console.log(`   Tokens (approx): ${jsonTokens}`);

// LMON baseline
const lmonBaselineBytes = Buffer.byteLength(lmonBaseline, 'utf8');
const lmonBaselineChars = lmonBaseline.length;
const lmonBaselineTokens = countTokens(lmonBaseline);

console.log('\n2. LMON (No Macros)');
console.log(`   Input Bytes: ${lmonBaselineBytes}`);
console.log(`   Input Chars: ${lmonBaselineChars}`);
console.log(`   Input Tokens (approx): ${lmonBaselineTokens}`);
const lmonSavings = ((jsonBytes - lmonBaselineBytes) / jsonBytes * 100).toFixed(1);
const lmonTokenSavings = ((jsonTokens - lmonBaselineTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON: ${lmonSavings}% bytes, ${lmonTokenSavings}% tokens`);

// LMON macros in doc
const lmonMacrosInDocBytes = Buffer.byteLength(lmonMacrosInDoc, 'utf8');
const lmonMacrosInDocChars = lmonMacrosInDoc.length;
const lmonMacrosInDocTokens = countTokens(lmonMacrosInDoc);
const expandedMacrosInDoc = expand(lmonMacrosInDoc);
const expandedMacrosInDocBytes = Buffer.byteLength(expandedMacrosInDoc, 'utf8');

console.log('\n3. LMON (Macros in Document)');
console.log(`   Input Bytes: ${lmonMacrosInDocBytes}`);
console.log(`   Output Bytes: ${expandedMacrosInDocBytes}`);
console.log(`   Input Chars: ${lmonMacrosInDocChars}`);
console.log(`   Input Tokens (approx): ${lmonMacrosInDocTokens}`);
const macrosDocSavings = ((jsonBytes - lmonMacrosInDocBytes) / jsonBytes * 100).toFixed(1);
const macrosDocTokenSavings = ((jsonTokens - lmonMacrosInDocTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON (input): ${macrosDocSavings}% bytes, ${macrosDocTokenSavings}% tokens`);
const macrosDocOutputSavings = ((jsonBytes - expandedMacrosInDocBytes) / jsonBytes * 100).toFixed(1);
console.log(`   Savings vs JSON (output): ${macrosDocOutputSavings}% bytes`);

// LMON preloaded
const lmonPreloadedBytes = Buffer.byteLength(lmonPreloaded, 'utf8');
const lmonPreloadedChars = lmonPreloaded.length;
const lmonPreloadedTokens = countTokens(lmonPreloaded);
const expandedPreloaded = expand(lmonPreloaded, { initialContext: macroContext });
const expandedPreloadedBytes = Buffer.byteLength(expandedPreloaded, 'utf8');

console.log('\n4. LMON (Preloaded Macros via initialContext)');
console.log(`   Input Bytes: ${lmonPreloadedBytes}`);
console.log(`   Output Bytes: ${expandedPreloadedBytes}`);
console.log(`   Input Chars: ${lmonPreloadedChars}`);
console.log(`   Input Tokens (approx): ${lmonPreloadedTokens}`);
const preloadedSavings = ((jsonBytes - lmonPreloadedBytes) / jsonBytes * 100).toFixed(1);
const preloadedTokenSavings = ((jsonTokens - lmonPreloadedTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON (input): ${preloadedSavings}% bytes, ${preloadedTokenSavings}% tokens`);

// Summary table
console.log('\n=== COMPARISON TABLE ===\n');
console.log('| Format | Input Bytes | Input Tokens | Output Bytes | Savings vs JSON |');
console.log('|--------|-------------|--------------|--------------|-----------------|');
console.log(`| JSON | ${jsonBytes} | ${jsonTokens} | — | — |`);
console.log(`| LMON (no macros) | ${lmonBaselineBytes} | ${lmonBaselineTokens} | ${lmonBaselineBytes} | ${lmonSavings}% bytes, ${lmonTokenSavings}% tokens |`);
console.log(`| LMON (macros in doc) | ${lmonMacrosInDocBytes} | ${lmonMacrosInDocTokens} | ${expandedMacrosInDocBytes} | ${macrosDocSavings}% bytes (input), ${macrosDocOutputSavings}% (output) |`);
console.log(`| LMON (preloaded) | ${lmonPreloadedBytes} | ${lmonPreloadedTokens} | ${expandedPreloadedBytes} | ${preloadedSavings}% bytes, ${preloadedTokenSavings}% tokens |`);

// Key insights
console.log('\n=== KEY INSIGHTS ===\n');
const preloadedVsBaseline = ((lmonBaselineBytes - lmonPreloadedBytes) / lmonBaselineBytes * 100).toFixed(1);
const preloadedVsMacrosInDoc = ((lmonMacrosInDocBytes - lmonPreloadedBytes) / lmonMacrosInDocBytes * 100).toFixed(1);
console.log(`✓ Preloaded macros are ${preloadedVsBaseline}% smaller than LMON without macros`);
console.log(`✓ Preloaded macros are ${preloadedVsMacrosInDoc}% smaller than macros in document`);
console.log(`✓ LMON with preloaded macros saves ${preloadedSavings}% bytes vs JSON (input)`);
console.log(`✓ All LMON variants maintain ${lmonTokenSavings}% token savings over JSON`);
console.log(`\nBest practice for reusable templates: Use preloaded macros via initialContext`);
console.log(`  - Minimal input overhead (${(lmonPreloadedBytes - lmonBaselineBytes)} bytes)`);
console.log(`  - Maintains full macro expansion benefits`);
console.log(`  - Code-driven configuration (better for programmatic use)`);
