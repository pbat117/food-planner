# Food Planner

A weekly shopping list that covers about 90% or more of your recommended nutrients, built from foods you choose. No AI: a nutrition optimizer (the HiGHS solver) sizes the foods, using USDA nutrient data and the NIH/National Academies reference values.

- **Your foods** are always on the list; the app sizes them. Staples (rice, milk, …) come from foods you like.
- The list shows grams and estimated items side by side, grouped like a shopping list, with a daily average and notes.
- The **nutrient report** shows each nutrient as a percent of the weekly target and suggests a food for anything low.
- **Don't like** a food, or fix its amount, and see Now vs New before you apply it. Undo goes back a step.
- Supplements you take (e.g. vitamin D, omega-3) are listed with when to take them.
- Settings and your last list stay on your device (in the browser). Accounts and sync come later.

## Run it on your computer

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. `npm test` runs the tests.

## Put it online (free, on Vercel)

1. Create a free GitHub account at github.com, then a new **empty** repository called `food-planner` (no README, no .gitignore).
2. In this folder, connect it and upload the code (GitHub shows these lines on the empty repository's page):

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/food-planner.git
   git push -u origin main
   ```

3. Go to vercel.com, choose **Sign up** → **Continue with GitHub** (the free Hobby plan).
4. Choose **Add New → Project**, pick `food-planner`, keep the framework preset **Next.js**, and choose **Deploy**.
5. Open the address Vercel gives you on your iPhone in Safari, then **Share → Add to Home Screen** so it opens like an app.

Every later `git push` to `main` redeploys automatically.

## Updating the food data

`src/data/foods.json` is generated from `data/foods-seed.csv` and the USDA SR Legacy download:

```bash
npx tsx scripts/build-foods.ts <path to the unzipped SR Legacy CSV folder>
```
