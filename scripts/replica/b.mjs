// Client for drv.mjs. Usage: node b.mjs cmd args... [; cmd args...]
// Several commands can be chained with a lone ";" argument.
const argv = process.argv.slice(2);
const groups = [[]];
for (const a of argv) {
  if (a === ";") groups.push([]);
  else groups.at(-1).push(a);
}
for (const [cmd, ...args] of groups.filter((g) => g.length)) {
  const r = await fetch("http://127.0.0.1:9555", { method: "POST", body: JSON.stringify({ cmd, args }) });
  const t = await r.text();
  console.log(groups.length > 1 ? `» ${cmd} ${args.join(" ")}\n${t}` : t);
}
