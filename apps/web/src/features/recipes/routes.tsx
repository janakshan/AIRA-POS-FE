import type { RouteObject } from 'react-router';

/** REC-001…005 (lazy), keyed by nav item; each nav item's RECIPES + permission guard wraps them. */
const recipeForm = {
  lazy: async () => ({
    Component: (await import('./pages/recipe-form-page')).RecipeFormPage,
  }),
};

export const recipeRoutes: Record<string, RouteObject[]> = {
  ingredients: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/ingredient-list-page')).IngredientListPage,
      }),
    },
  ],
  recipes: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/recipe-list-page')).RecipeListPage,
      }),
    },
    { path: 'new', ...recipeForm },
    { path: ':productId', ...recipeForm },
  ],
  portions: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/portion-setup-page')).PortionSetupPage,
      }),
    },
  ],
  prepared: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/prepared-queue-page')).PreparedQueuePage,
      }),
    },
  ],
};
