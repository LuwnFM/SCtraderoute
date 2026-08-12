import fs from 'node:fs/promises'
const required=['public/index.html','public/app.js','public/styles.css','public/data/trade-snapshot.json']
for (const file of required) {
  const stat=await fs.stat(file).catch(()=>null)
  if (!stat?.isFile() || stat.size===0) throw new Error(`Missing build artifact: ${file}`)
}
const html=await fs.readFile('public/index.html','utf8')
if (!html.includes('./app.js') || !html.includes('./styles.css')) throw new Error('index.html has broken local asset references')
const data=JSON.parse(await fs.readFile('public/data/trade-snapshot.json','utf8'))
if (!Array.isArray(data.listings) || !Array.isArray(data.terminals) || !data.listings.length) throw new Error('trade snapshot is empty or invalid')
console.log(`Static build OK: ${data.listings.length} listings, ${data.terminals.length} terminals`)
