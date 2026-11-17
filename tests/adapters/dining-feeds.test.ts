import { describe, expect, it } from "vitest";
import { fetchNutrisliceMenus } from "../../convex/lib/diningFeeds";

const school = { slug: "the-commons", id: 6196, types: [{ id: 6886, name: "Lunch" }] };
const now = Date.parse("2026-11-17T18:00:00Z");
const icon = (slug: string, enabled = true) => ({ slug, enabled });

async function menuFor(foods: Array<Record<string, unknown>>) {
  const day = (date: string) => ({ date, menu_items: foods.map((food) => ({ food })) });
  const menus = await fetchNutrisliceMenus([school], new Set(["the-commons"]), now, async () => ({
    ok: true, status: 200, text: async () => "",
    json: async () => ({ days: [day("2026-11-17"), day("2026-11-18")] }),
  }));
  return JSON.parse(menus[0]!.todayMenuJson).stations[0].items as Array<Record<string, unknown>>;
}

describe("Nutrislice menu labels", () => {
  it("normalizes live food icons to the dietary and allergen vocabulary used by filters", async () => {
    const [vegan, shrimp] = await menuFor([
      { name: "Vegan Wedges", icons_approved: true, icons: { food_icons: [icon("vegan"), icon("gluten-free"), icon("halal")] } },
      { name: "Cajun Shrimp", icons_approved: true, icons: { food_icons: [icon("wheat"), icon("soy"), icon("crustaceans"), icon("dairy")] } },
    ]);
    expect(vegan).toMatchObject({ dietaryTags: ["vegan", "gluten_free", "halal_friendly"], allergens: [] });
    expect(shrimp).toMatchObject({ allergens: ["wheat", "soy", "shellfish", "milk"] });
  });

  it("does not infer allergen-free from missing, unapproved, or empty icon data", async () => {
    const items = await menuFor([
      { name: "No icons" },
      { name: "Unapproved", icons_approved: false, icons: { food_icons: [icon("vegan")] } },
      { name: "Empty approved list", icons_approved: true, icons: { food_icons: [] } },
      { name: "Disabled only", icons_approved: true, icons: { food_icons: [icon("dairy", false)] } },
    ]);
    for (const item of items) expect(item).not.toHaveProperty("allergens");
  });

  it("does not report allergens as complete when an icon is unrecognized", async () => {
    const [item] = await menuFor([
      { name: "Mystery", icons_approved: true, icons: { food_icons: [icon("vegan"), icon("mystery-allergen")] } },
    ]);
    expect(item).toMatchObject({ dietaryTags: ["vegan"] });
    expect(item).not.toHaveProperty("allergens");
  });

  it("keeps already-normalized tags and allergens", async () => {
    const [item] = await menuFor([{ name: "Legacy", dietary_tags: ["vegan"], allergens: [] }]);
    expect(item).toMatchObject({ dietaryTags: ["vegan"], allergens: [] });
  });
});
