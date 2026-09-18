import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = fs.readFileSync(path.join(root,"app/PublicScanPage.tsx"),"utf8");
const inventory = fs.readFileSync(path.join(root,"app/InventoryClient.tsx"),"utf8");
const css = fs.readFileSync(path.join(root,"app/registry/registry.module.css"),"utf8");

describe("Extension Registry product surface",()=>{
  it("frames registry search around identity and exact releases",()=>{
    expect(page).toContain("Know what runs");
    expect(page).toContain("Results separate exact matches from similar names.");
    expect(page).toContain("Version-specific");
    expect(page).toContain("A decision never silently follows an extension update.");
  });
  it("shows useful registry health rather than only internal totals",()=>{
    for(const label of ["Public intelligence","Exact artifacts","Needs attention","Last refreshed"]) expect(page).toContain(label);
  });
  it("paginates the current publication instead of truncating it at the first 240 reports",()=>{
    expect(page).toContain("INVENTORY_PAGE_SIZE = 240");
    expect(page).toContain("Current public report pages");
  });
  it("uses compact outcome, severity, and sort filters",()=>{
    expect(inventory).toContain("All outcomes");
    expect(inventory).toContain("All severities");
    expect(inventory).toContain("Recently analyzed");
    expect(inventory).toContain("Clear filters");
  });
  it("keeps exact release, scan date, coverage, and action on every card",()=>{
    for(const copy of ["Exact release","Analyzed ","evidence coverage","Open security profile"]) expect(inventory).toContain(copy);
  });
  it("uses scoped responsive styles",()=>{
    expect(page).toContain("registry.module.css");
    expect(inventory).toContain("registry.module.css");
    expect(css).toContain("@media(max-width:680px)");
  });
});
