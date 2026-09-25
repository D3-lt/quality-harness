import { describe, expect, it } from 'vitest'
import { addItem } from './cart'

describe('cart', () => {
  it('adds_an_item', () => {
    expect(addItem({ items: [] }, 'sku-1').items).toEqual(['sku-1'])
  })
})
