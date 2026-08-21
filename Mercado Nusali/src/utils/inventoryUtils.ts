export interface InventoryRow {
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * Single source of truth for total available stock across all locations.
 * available = SUM(Math.max(0, quantityOnHand - quantityReserved))
 */
export function calculateAvailableStock(inventoryRows: InventoryRow[] | undefined | null): number {
  if (!inventoryRows || !Array.isArray(inventoryRows) || inventoryRows.length === 0) {
    return 0;
  }

  return inventoryRows.reduce((sum, inv) => {
    const onHand = Number(inv.quantityOnHand) || 0;
    const reserved = Number(inv.quantityReserved) || 0;
    return sum + Math.max(0, onHand - reserved);
  }, 0);
}
