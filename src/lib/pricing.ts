export interface PricingInput {
  distanceKm: number
  consumptionLPerKm: number
  fuelPricePerLiter: number
  headCount: number
  truckCapacity: number
}

export interface PricingResult {
  tripsRequired: number
  fuelCostPerTrip: number
  totalFuelCost: number
}

export function calculateTripsRequired(headCount: number, truckCapacity: number): number {
  return Math.ceil(headCount / truckCapacity)
}

export function calculateFuelCost(
  distanceKm: number,
  consumptionLPerKm: number,
  fuelPricePerLiter: number,
): number {
  return distanceKm * consumptionLPerKm * fuelPricePerLiter
}

export function calculatePricing(input: PricingInput): PricingResult {
  const tripsRequired = calculateTripsRequired(input.headCount, input.truckCapacity)
  const fuelCostPerTrip = calculateFuelCost(
    input.distanceKm,
    input.consumptionLPerKm,
    input.fuelPricePerLiter,
  )
  return {
    tripsRequired,
    fuelCostPerTrip,
    totalFuelCost: fuelCostPerTrip * tripsRequired,
  }
}
