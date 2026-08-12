import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRoutes, computeMultiStop, DEFAULT_FILTERS, buildSystemPath } from '../public/lib/trade-core.js'

const now = Math.floor(Date.now()/1000)
const snapshot = {
  commodities:[
    {key:'commodity:gold',name:'Gold',isIllegal:false},
    {key:'commodity:maze',name:'Maze',isIllegal:true},
  ],
  terminals:[
    {key:'terminal:stanton:a',name:'A',system:'Stanton',location:'A',maxContainerSize:32},
    {key:'terminal:stanton:b',name:'B',system:'Stanton',location:'B',maxContainerSize:32},
    {key:'terminal:pyro:c',name:'C',system:'Pyro',location:'C',maxContainerSize:16},
  ],
  listings:[
    {commodityKey:'commodity:gold',commodityName:'Gold',locationKey:'terminal:stanton:a',action:'SELLS',price:100,quantity:100,updatedAt:now,source:'UEX'},
    {commodityKey:'commodity:gold',commodityName:'Gold',locationKey:'terminal:stanton:b',action:'BUYS',price:150,quantity:8,updatedAt:now,source:'UEX'},
    {commodityKey:'commodity:gold',commodityName:'Gold',locationKey:'terminal:stanton:b',action:'SELLS',price:120,quantity:100,updatedAt:now,source:'UEX'},
    {commodityKey:'commodity:gold',commodityName:'Gold',locationKey:'terminal:pyro:c',action:'BUYS',price:200,quantity:100,updatedAt:now,source:'SC Trade Tools'},
    {commodityKey:'commodity:maze',commodityName:'Maze',locationKey:'terminal:stanton:a',action:'SELLS',price:10,quantity:100,updatedAt:now,source:'UEX'},
    {commodityKey:'commodity:maze',commodityName:'Maze',locationKey:'terminal:stanton:b',action:'BUYS',price:20,quantity:100,updatedAt:now,source:'UEX'},
  ],
  jumpPoints:[{from:'Stanton',to:'Pyro',fromOrbit:'Gateway',toOrbit:'Gateway'}],
  distances:[{fromKey:'terminal:stanton:a',toKey:'terminal:stanton:b',distanceGm:10}],
}

function routes(patch={}) { return computeRoutes(snapshot,{...DEFAULT_FILTERS,capacity:20,budget:10_000,...patch}) }

test('demand caps cargo',()=>{
  const r=routes({terminalFrom:'terminal:stanton:a',terminalTo:'terminal:stanton:b'})[0]
  assert.equal(r.units,8)
  assert.equal(r.limitedBy,'спрос')
  assert.equal(r.profit,400)
})

test('budget caps cargo',()=>{
  const r=routes({terminalFrom:'terminal:stanton:a',terminalTo:'terminal:pyro:c',budget:350})[0]
  assert.equal(r.units,3)
  assert.equal(r.limitedBy,'бюджет')
})

test('capacity caps cargo',()=>{
  const r=routes({terminalFrom:'terminal:stanton:a',terminalTo:'terminal:pyro:c',capacity:5})[0]
  assert.equal(r.units,5)
  assert.equal(r.limitedBy,'трюм')
})

test('supply caps cargo',()=>{
  const copy=structuredClone(snapshot)
  copy.listings[0].quantity=4
  const r=computeRoutes(copy,{...DEFAULT_FILTERS,capacity:20,budget:10_000,terminalFrom:'terminal:stanton:a',terminalTo:'terminal:pyro:c'})[0]
  assert.equal(r.units,4)
  assert.equal(r.limitedBy,'наличие')
})

test('legal filter removes illegal commodity',()=>{
  assert.equal(routes({onlyLegal:true}).some(r=>r.commodity.key==='commodity:maze'),false)
})

test('stale filter checks both sides',()=>{
  const copy=structuredClone(snapshot)
  copy.listings[1].updatedAt=now-48*3600
  const result=computeRoutes(copy,{...DEFAULT_FILTERS,capacity:20,budget:10_000,maxAgeHours:24,commodity:'commodity:gold',terminalFrom:'terminal:stanton:a',terminalTo:'terminal:stanton:b'})
  assert.equal(result.length,0)
})

test('distance filter excludes unknown and too-far routes',()=>{
  assert.equal(routes({maxDistanceGm:5}).length,0)
  assert.equal(routes({maxDistanceGm:15,terminalFrom:'terminal:stanton:a',terminalTo:'terminal:stanton:b'}).length,2)
})

test('container filter respects terminal max size',()=>{
  assert.equal(routes({containerSize:32,terminalTo:'terminal:pyro:c'}).length,0)
})

test('system path uses jump point graph',()=>{
  const p=buildSystemPath(snapshot.jumpPoints,'Stanton','Pyro')
  assert.deepEqual(p.systems,['Stanton','Pyro'])
  assert.equal(p.jumpCount,1)
})

test('multi-stop builds chained route',()=>{
  const simple=routes({onlyLegal:true})
  const multi=computeMultiStop(simple,{...DEFAULT_FILTERS,capacity:20,budget:10_000},2)
  assert.ok(multi.some(m=>m.legs.length===2))
})
