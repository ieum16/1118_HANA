import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, parseRates } from './fx-core.mjs';

test('USD spread and discount, buy and sell', () => {
  const value = calculate('USD', {rate:'1,400',amount:'100',spread:'2',discount:'50'});
  assert.equal(value.base,140000);
  assert.equal(value.buy,141400);
  assert.equal(value.sell,138600);
});
test('JPY uses 100 yen quote; 100% discount removes spread', () => {
  const value=calculate('JPY',{rate:'950',amount:'10,000',spread:'1.75',discount:'100'});
  assert.equal(value.base,95000); assert.equal(value.buy,95000); assert.equal(value.sell,95000);
});
test('fractional EUR and zero amount', () => {
  assert.equal(calculate('EUR',{rate:'1500',amount:'1.5',spread:'0',discount:'0'}).base,2250);
  assert.equal(calculate('USD',{rate:'1400',amount:'0',spread:'0',discount:'0'}).base,0);
});
test('invalid input, overflows, and percent bounds rejected', () => {
  const base={rate:'1400',amount:'100',spread:'2',discount:'0'};
  for(const patch of [{rate:''},{rate:'-1'},{amount:'-1'},{spread:'101'},{discount:'-1'},{discount:'101'},{amount:'Infinity'},{amount:'9'.repeat(309)},{rate:'0'}])
    assert.ok(calculate('USD',{...base,...patch}).error,JSON.stringify(patch));
});
test('tab-separated bank table selects base instead of cash rate', () => {
  assert.deepEqual(parseRates('통화\t현찰 살 때\t현찰 팔 때\t매매기준율\n미국 USD\t1,424.50\t1,375.50\t1,400.00\n일본 JPY(100엔)\t966.63\t933.37\t950.00\n유로 EUR\t1,530\t1,470\t1,500').rates,{USD:1400,JPY:950,EUR:1500});
});
test('simple currency rows and JPY(100) supported', () => {
  assert.deepEqual(parseRates('USD 1,400\nJPY(100) 950\nEUR 1,500').rates,{USD:1400,JPY:950,EUR:1500});
});
test('ambiguous bank rows, negatives and duplicate rows do not silently override', () => {
  const parsed=parseRates('USD 1400 1424 1376\nEUR -1500\nJPY 950\nJPY 960');
  assert.deepEqual(parsed.rates,{JPY:950});assert.ok(parsed.warnings.length>=3);
});
test('CSV table and one-yen quote normalization', () => {
  assert.deepEqual(parseRates('通貨').rates,{});
  assert.deepEqual(parseRates('통화,매매기준율,현찰 살 때\nUSD,"1,400.00","1,424.50"\nJPY(1엔),9.5,9.6').rates,{USD:1400,JPY:950});
  assert.deepEqual(parseRates('통화,기준환율\nUSD,1400\nEUR,1500').rates,{USD:1400,EUR:1500});
});
