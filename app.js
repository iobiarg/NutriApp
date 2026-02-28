const STORAGE_KEYS = {
  foods: "nutriapp_foods",
  meals: "nutriapp_meals",
  history: "nutriapp_history",
  recipes: "nutriapp_recipes",
};

const defaultFoods = {
  manzana: {
    name: "Manzana",
    per100g: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14, fiber: 2.4 },
    source: "Valores estándar regionales",
  },
  huevo: {
    name: "Huevo",
    per100g: { calories: 155, protein: 13, fat: 11, carbs: 1.1, fiber: 0 },
    source: "Valores estándar regionales",
  },
};

let foods = loadData(STORAGE_KEYS.foods, defaultFoods);
let meals = loadData(STORAGE_KEYS.meals, []);
let history = loadData(STORAGE_KEYS.history, []);
let recipes = loadData(STORAGE_KEYS.recipes, []);

const $ = (id) => document.getElementById(id);

initTabs();
initMeals();
initRecipes();
initNutritionLoader();
renderAll();

function loadData(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.foods, JSON.stringify(foods));
  localStorage.setItem(STORAGE_KEYS.meals, JSON.stringify(meals));
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(recipes));
}

function normalize(text) {
  return text.trim().toLowerCase();
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.section).classList.add("active");
    });
  });
}

function computeNetCarbs(values) {
  return (values.carbs || 0) - (values.fiber || 0);
}

function valuesComplete(item) {
  const required = ["calories", "protein", "fat", "carbs", "fiber"];
  return item?.per100g && required.every((k) => Number.isFinite(item.per100g[k]));
}

function scaleValues(per100g, grams) {
  const f = grams / 100;
  return {
    calories: per100g.calories * f,
    protein: per100g.protein * f,
    fat: per100g.fat * f,
    carbs: per100g.carbs * f,
    fiber: per100g.fiber * f,
    netCarbs: computeNetCarbs(per100g) * f,
  };
}

async function fetchFoodFromWeb(foodName) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(foodName)}&search_simple=1&json=1&page_size=1`;
  const response = await fetch(url);
  const data = await response.json();
  const product = data.products?.[0];
  if (!product) {
    return null;
  }
  const nutriments = product.nutriments || {};
  const per100g = {
    calories: nutriments["energy-kcal_100g"],
    protein: nutriments.proteins_100g,
    fat: nutriments.fat_100g,
    carbs: nutriments.carbohydrates_100g,
    fiber: nutriments.fiber_100g ?? 0,
  };
  if (Object.values(per100g).some((v) => !Number.isFinite(Number(v)))) {
    return null;
  }
  return {
    name: product.product_name || foodName,
    per100g: {
      calories: Number(per100g.calories),
      protein: Number(per100g.protein),
      fat: Number(per100g.fat),
      carbs: Number(per100g.carbs),
      fiber: Number(per100g.fiber),
    },
    source: `Open Food Facts: ${product.url || "https://world.openfoodfacts.org"}`,
  };
}

function initMeals() {
  $("meal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mealType = $("meal-type").value;
    const foodName = $("food-name").value.trim();
    const amount = Number($("food-amount").value);
    const unit = $("food-unit").value;
    const gramsPerUnit = Number($("grams-per-unit").value || 0);
    const grams = unit === "gramos" ? amount : amount * gramsPerUnit;
    const key = normalize(foodName);

    let food = foods[key];
    if (food && !valuesComplete(food)) {
      const found = await fetchFoodFromWeb(foodName);
      if (found) {
        foods[key] = found;
        food = found;
      }
    }

    if (!food) {
      const found = await fetchFoodFromWeb(foodName);
      if (!found) {
        alert("No se encontró el alimento en memoria ni en fuentes web automáticas. Cargalo manualmente en sección 3.");
        return;
      }
      foods[key] = found;
      food = found;
    }

    if (!valuesComplete(food)) {
      alert("El alimento no tiene datos completos de macros. Completalo en sección 3.");
      return;
    }

    meals.push({
      id: crypto.randomUUID(),
      mealType,
      foodName: food.name,
      grams,
      source: food.source,
      values: scaleValues(food.per100g, grams),
    });
    saveAll();
    renderDailyMeals();
    renderFoods();
    e.target.reset();
    $("food-amount").value = 100;
    $("grams-per-unit").value = 100;
  });

  $("close-day").addEventListener("click", () => {
    const totals = sumMeals(meals);
    const today = new Date();
    const dayName = today.toLocaleDateString("es-AR", { weekday: "long" });
    const ddmmyy = today.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

    history.push({
      label: `${dayName} ${ddmmyy}`,
      ...totals,
    });
    meals = [];
    saveAll();
    renderDailyMeals();
    renderHistory();
  });

  $("refresh-totals").addEventListener("click", renderDailyMeals);
}

function sumMeals(items) {
  return items.reduce(
    (acc, it) => {
      acc.calories += it.values.calories;
      acc.protein += it.values.protein;
      acc.fat += it.values.fat;
      acc.carbs += it.values.carbs;
      acc.fiber += it.values.fiber;
      acc.netCarbs += it.values.netCarbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 }
  );
}

function fmt(num) {
  return Number(num).toFixed(1);
}

function renderDailyMeals() {
  const list = $("meal-list");
  list.innerHTML = "";
  meals.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span><strong>${m.mealType}</strong> · ${m.foodName} (${fmt(m.grams)} g) · ${fmt(m.values.calories)} kcal<br><small>Fuente: ${m.source}</small></span>
      <span>
        <button data-edit="${m.id}">Editar</button>
        <button data-delete="${m.id}">Eliminar</button>
      </span>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      meals = meals.filter((m) => m.id !== btn.dataset.delete);
      saveAll();
      renderDailyMeals();
    });
  });

  list.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const found = meals.find((m) => m.id === btn.dataset.edit);
      if (!found) return;
      $("meal-type").value = found.mealType;
      $("food-name").value = found.foodName;
      $("food-amount").value = found.grams;
      $("food-unit").value = "gramos";
      meals = meals.filter((m) => m.id !== found.id);
      saveAll();
      renderDailyMeals();
    });
  });

  const t = sumMeals(meals);
  $("totals").textContent = `Totales hoy → kcal ${fmt(t.calories)} | Prot ${fmt(t.protein)} g | Grasas ${fmt(t.fat)} g | Carb ${fmt(t.carbs)} g | Fibra ${fmt(t.fiber)} g | Netos ${fmt(t.netCarbs)} g`;
}

function renderHistory() {
  const body = $("history-body");
  body.innerHTML = "";
  history.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.label}</td>
      <td>${fmt(d.calories)}</td>
      <td>${fmt(d.protein)}</td>
      <td>${fmt(d.fat)}</td>
      <td>${fmt(d.carbs)}</td>
      <td>${fmt(d.fiber)}</td>
      <td>${fmt(d.netCarbs)}</td>
    `;
    body.appendChild(tr);
  });
}

function initRecipes() {
  const ingredientsBox = $("recipe-ingredients");
  const addIngredientRow = (name = "", grams = 100) => {
    const row = document.createElement("div");
    row.className = "form-grid";
    row.innerHTML = `
      <label>Ingrediente
        <input class="ing-name" value="${name}" required />
      </label>
      <label>Gramos usados
        <input class="ing-grams" type="number" min="0" value="${grams}" required />
      </label>
      <button type="button" class="remove-ing">Quitar</button>
    `;
    row.querySelector(".remove-ing").addEventListener("click", () => row.remove());
    ingredientsBox.appendChild(row);
  };

  addIngredientRow();
  $("add-ingredient").addEventListener("click", () => addIngredientRow());

  $("recipe-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("recipe-name").value.trim();
    const finalWeight = Number($("recipe-final-weight").value);
    const rows = [...ingredientsBox.querySelectorAll(".form-grid")];

    let totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 };
    const ingredients = [];
    for (const row of rows) {
      const ingName = row.querySelector(".ing-name").value.trim();
      const grams = Number(row.querySelector(".ing-grams").value);
      const key = normalize(ingName);
      let food = foods[key];
      if (!food) {
        food = await fetchFoodFromWeb(ingName);
        if (food) foods[key] = food;
      }
      if (!food || !valuesComplete(food)) {
        alert(`Ingrediente sin datos completos: ${ingName}`);
        return;
      }
      const values = scaleValues(food.per100g, grams);
      totals = {
        calories: totals.calories + values.calories,
        protein: totals.protein + values.protein,
        fat: totals.fat + values.fat,
        carbs: totals.carbs + values.carbs,
        fiber: totals.fiber + values.fiber,
        netCarbs: totals.netCarbs + values.netCarbs,
      };
      ingredients.push({ ingName, grams });
    }

    const per100g = scaleValues(totals, 100 / finalWeight * 100);
    const key = normalize(name);
    foods[key] = {
      name,
      per100g: {
        calories: per100g.calories,
        protein: per100g.protein,
        fat: per100g.fat,
        carbs: per100g.carbs,
        fiber: per100g.fiber,
      },
      source: "Receta propia",
    };

    const existingIdx = recipes.findIndex((r) => normalize(r.name) === key);
    const recipeData = { name, finalWeight, ingredients, totals };
    if (existingIdx >= 0) recipes[existingIdx] = recipeData;
    else recipes.push(recipeData);

    $("recipe-result").textContent = `Guardada: ${name} · por 100g: ${fmt(per100g.calories)} kcal, ${fmt(per100g.protein)}g proteína, ${fmt(per100g.fat)}g grasas, ${fmt(per100g.carbs)}g carbos (${fmt(per100g.fiber)}g fibra).`;

    saveAll();
    renderRecipes();
    renderFoods();
  });
}

function renderRecipes() {
  const list = $("recipe-list");
  list.innerHTML = "";
  recipes.forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${r.name}</strong> · Peso final ${fmt(r.finalWeight)} g · ${r.ingredients.length} ingredientes</span>
      <span><button data-edit-recipe="${r.name}">Editar</button></span>`;
    list.appendChild(li);
  });

  list.querySelectorAll("button[data-edit-recipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const recipe = recipes.find((r) => r.name === btn.dataset.editRecipe);
      if (!recipe) return;
      $("recipe-name").value = recipe.name;
      $("recipe-final-weight").value = recipe.finalWeight;
      const box = $("recipe-ingredients");
      box.innerHTML = "";
      recipe.ingredients.forEach((i) => {
        const row = document.createElement("div");
        row.className = "form-grid";
        row.innerHTML = `
          <label>Ingrediente
            <input class="ing-name" value="${i.ingName}" required />
          </label>
          <label>Gramos usados
            <input class="ing-grams" type="number" min="0" value="${i.grams}" required />
          </label>
          <button type="button" class="remove-ing">Quitar</button>
        `;
        row.querySelector(".remove-ing").addEventListener("click", () => row.remove());
        box.appendChild(row);
      });
      document.querySelector('[data-section="recetas"]').click();
    });
  });
}

function parseNutritionText(text) {
  const grab = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1].replace(",", ".")) : null;
  };
  return {
    calories: grab(/(?:kcal|calor(?:í|i)as?)\D*(\d+[\.,]?\d*)/i),
    protein: grab(/prote(?:í|i)nas?\D*(\d+[\.,]?\d*)/i),
    fat: grab(/grasas?\D*(\d+[\.,]?\d*)/i),
    carbs: grab(/carbohidratos?\D*(\d+[\.,]?\d*)/i),
    fiber: grab(/fibra\D*(\d+[\.,]?\d*)/i) ?? 0,
  };
}

function initNutritionLoader() {
  $("manual-nutrition-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("manual-food-name").value.trim();
    const source = $("manual-source").value.trim();
    const values = parseNutritionText($("manual-text").value);
    if ([values.calories, values.protein, values.fat, values.carbs].some((v) => !Number.isFinite(v))) {
      alert("No se pudieron extraer todos los valores requeridos.");
      return;
    }
    foods[normalize(name)] = { name, per100g: values, source };
    saveAll();
    renderFoods();
    e.target.reset();
  });

  $("photo-nutrition-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = $("photo-input").files[0];
    if (!file) return;
    const { data } = await Tesseract.recognize(file, "spa+eng");
    $("ocr-output").textContent = data.text;
    const values = parseNutritionText(data.text);
    const name = $("photo-food-name").value.trim();
    const source = $("photo-source").value.trim();
    if ([values.calories, values.protein, values.fat, values.carbs].some((v) => !Number.isFinite(v))) {
      alert("OCR incompleto. Revisá y cargá manualmente.");
      return;
    }
    foods[normalize(name)] = { name, per100g: values, source };
    saveAll();
    renderFoods();
  });
}

function renderFoods() {
  const list = $("food-memory");
  list.innerHTML = "";
  Object.values(foods).forEach((f) => {
    const complete = valuesComplete(f) ? "✅" : "⚠️";
    const li = document.createElement("li");
    li.textContent = `${complete} ${f.name} · kcal ${fmt(f.per100g?.calories ?? 0)} · P ${fmt(f.per100g?.protein ?? 0)} · G ${fmt(f.per100g?.fat ?? 0)} · C ${fmt(f.per100g?.carbs ?? 0)} · Fibra ${fmt(f.per100g?.fiber ?? 0)} · Fuente: ${f.source}`;
    list.appendChild(li);
  });
}

function renderAll() {
  renderDailyMeals();
  renderHistory();
  renderRecipes();
  renderFoods();
}
