export type Cart = { items: string[] }

export function addItem(cart: Cart, sku: string): Cart {
  return { items: [...cart.items, sku] }
}
