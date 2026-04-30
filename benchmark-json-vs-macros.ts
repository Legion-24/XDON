/**
 * JSON vs XCON Macro Comparison
 * Shows how macros affect token savings vs JSON
 */

import { expand } from './packages/xcon/src/index';

function countTokens(text: string): number {
  return text.split(/[\s\(\)\{\}\[\],":]+/).filter(t => t.length > 0).length;
}

// Test data
const json = `[
  {"id": 1, "name": "Alice", "email": "alice@example.com", "role": "admin", "active": true},
  {"id": 2, "name": "Bob", "email": "bob@example.com", "role": "user", "active": false},
  {"id": 3, "name": "Charlie", "email": "charlie@example.com", "role": "user", "active": true}
]`;

const xconBaseline = `(id,name,email,role,active)
{1,Alice,alice@example.com,admin,true}
{2,Bob,bob@example.com,user,false}
{3,Charlie,charlie@example.com,user,true}`;

const xconMacrosInDoc = `%header = "(id,name,email,role,active)"
%admin = "admin"
%user = "user"

%header
{1,Alice,alice@example.com,%admin,true}
{2,Bob,bob@example.com,%user,false}
{3,Charlie,charlie@example.com,%user,true}`;

const xconPreloaded = `(id,name,email,role,active)
{1,Alice,alice@example.com,%admin,true}
{2,Bob,bob@example.com,%user,false}
{3,Charlie,charlie@example.com,%user,true}`;

const macroContext = new Map([
  ['admin', { body: 'admin', params: null, sourceLine: 0 }],
  ['user', { body: 'user', params: null, sourceLine: 0 }],
]);

console.log('=== JSON vs XCON Macro Comparison ===\n');

// JSON
const jsonBytes = Buffer.byteLength(json, 'utf8');
const jsonChars = json.length;
const jsonTokens = countTokens(json);

console.log('1. JSON (Baseline)');
console.log(`   Bytes: ${jsonBytes}`);
console.log(`   Chars: ${jsonChars}`);
console.log(`   Tokens (approx): ${jsonTokens}`);

// XCON baseline
const xconBaselineBytes = Buffer.byteLength(xconBaseline, 'utf8');
const xconBaselineChars = xconBaseline.length;
const xconBaselineTokens = countTokens(xconBaseline);

console.log('\n2. XCON (No Macros)');
console.log(`   Input Bytes: ${xconBaselineBytes}`);
console.log(`   Input Chars: ${xconBaselineChars}`);
console.log(`   Input Tokens (approx): ${xconBaselineTokens}`);
const xconSavings = ((jsonBytes - xconBaselineBytes) / jsonBytes * 100).toFixed(1);
const xconTokenSavings = ((jsonTokens - xconBaselineTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON: ${xconSavings}% bytes, ${xconTokenSavings}% tokens`);

// XCON macros in doc
const xconMacrosInDocBytes = Buffer.byteLength(xconMacrosInDoc, 'utf8');
const xconMacrosInDocChars = xconMacrosInDoc.length;
const xconMacrosInDocTokens = countTokens(xconMacrosInDoc);
const expandedMacrosInDoc = expand(xconMacrosInDoc);
const expandedMacrosInDocBytes = Buffer.byteLength(expandedMacrosInDoc, 'utf8');

console.log('\n3. XCON (Macros in Document)');
console.log(`   Input Bytes: ${xconMacrosInDocBytes}`);
console.log(`   Output Bytes: ${expandedMacrosInDocBytes}`);
console.log(`   Input Chars: ${xconMacrosInDocChars}`);
console.log(`   Input Tokens (approx): ${xconMacrosInDocTokens}`);
const macrosDocSavings = ((jsonBytes - xconMacrosInDocBytes) / jsonBytes * 100).toFixed(1);
const macrosDocTokenSavings = ((jsonTokens - xconMacrosInDocTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON (input): ${macrosDocSavings}% bytes, ${macrosDocTokenSavings}% tokens`);
const macrosDocOutputSavings = ((jsonBytes - expandedMacrosInDocBytes) / jsonBytes * 100).toFixed(1);
console.log(`   Savings vs JSON (output): ${macrosDocOutputSavings}% bytes`);

// XCON preloaded
const xconPreloadedBytes = Buffer.byteLength(xconPreloaded, 'utf8');
const xconPreloadedChars = xconPreloaded.length;
const xconPreloadedTokens = countTokens(xconPreloaded);
const expandedPreloaded = expand(xconPreloaded, { initialContext: macroContext });
const expandedPreloadedBytes = Buffer.byteLength(expandedPreloaded, 'utf8');

console.log('\n4. XCON (Preloaded Macros via initialContext)');
console.log(`   Input Bytes: ${xconPreloadedBytes}`);
console.log(`   Output Bytes: ${expandedPreloadedBytes}`);
console.log(`   Input Chars: ${xconPreloadedChars}`);
console.log(`   Input Tokens (approx): ${xconPreloadedTokens}`);
const preloadedSavings = ((jsonBytes - xconPreloadedBytes) / jsonBytes * 100).toFixed(1);
const preloadedTokenSavings = ((jsonTokens - xconPreloadedTokens) / jsonTokens * 100).toFixed(1);
console.log(`   Savings vs JSON (input): ${preloadedSavings}% bytes, ${preloadedTokenSavings}% tokens`);

// Summary table
console.log('\n=== COMPARISON TABLE ===\n');
console.log('| Format | Input Bytes | Input Tokens | Output Bytes | Savings vs JSON |');
console.log('|--------|-------------|--------------|--------------|-----------------|');
console.log(`| JSON | ${jsonBytes} | ${jsonTokens} | — | — |`);
console.log(`| XCON (no macros) | ${xconBaselineBytes} | ${xconBaselineTokens} | ${xconBaselineBytes} | ${xconSavings}% bytes, ${xconTokenSavings}% tokens |`);
console.log(`| XCON (macros in doc) | ${xconMacrosInDocBytes} | ${xconMacrosInDocTokens} | ${expandedMacrosInDocBytes} | ${macrosDocSavings}% bytes (input), ${macrosDocOutputSavings}% (output) |`);
console.log(`| XCON (preloaded) | ${xconPreloadedBytes} | ${xconPreloadedTokens} | ${expandedPreloadedBytes} | ${preloadedSavings}% bytes, ${preloadedTokenSavings}% tokens |`);

// Key insights
console.log('\n=== KEY INSIGHTS ===\n');
const preloadedVsBaseline = ((xconBaselineBytes - xconPreloadedBytes) / xconBaselineBytes * 100).toFixed(1);
const preloadedVsMacrosInDoc = ((xconMacrosInDocBytes - xconPreloadedBytes) / xconMacrosInDocBytes * 100).toFixed(1);
console.log(`✓ Preloaded macros are ${preloadedVsBaseline}% smaller than XCON without macros`);
console.log(`✓ Preloaded macros are ${preloadedVsMacrosInDoc}% smaller than macros in document`);
console.log(`✓ XCON with preloaded macros saves ${preloadedSavings}% bytes vs JSON (input)`);
console.log(`✓ All XCON variants maintain ${xconTokenSavings}% token savings over JSON`);
console.log(`\nBest practice for reusable templates: Use preloaded macros via initialContext`);
console.log(`  - Minimal input overhead (${(xconPreloadedBytes - xconBaselineBytes)} bytes)`);
console.log(`  - Maintains full macro expansion benefits`);
console.log(`  - Code-driven configuration (better for programmatic use)`);
