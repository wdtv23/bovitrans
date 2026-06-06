import {
  calculateFuelCost,
  calculateTripsRequired,
  calculatePricing,
} from './pricing'

// ---------------------------------------------------------------------------
// calculateFuelCost
// ---------------------------------------------------------------------------

describe('calculateFuelCost', () => {
  it('calcula el costo con los valores del seed A1 (R2 → ABCD 123)', () => {
    // 327 km × 0.420 L/km × 7400 Gs./L = 1.016.316 Gs.
    expect(calculateFuelCost(327, 0.42, 7400)).toBeCloseTo(1_016_316, 2)
  })

  it('calcula el costo con los valores del seed A2 (R4 → EFGH 456)', () => {
    // 370 km × 0.380 L/km × 7400 Gs./L = 1.040.440 Gs.
    expect(calculateFuelCost(370, 0.38, 7400)).toBeCloseTo(1_040_440, 2)
  })

  it('devuelve 0 cuando la distancia es 0 (camión en el mismo punto)', () => {
    expect(calculateFuelCost(0, 0.42, 7400)).toBe(0)
  })

  it('refleja correctamente el precio vigente al momento del cálculo (snapshot)', () => {
    const price2024 = 7400
    const price2025 = 8200

    const costoHistorico = calculateFuelCost(327, 0.42, price2024)
    const costoNuevo    = calculateFuelCost(327, 0.42, price2025)

    // El resultado histórico no cambia aunque el precio global cambie luego —
    // porque la función es pura: cada llamada usa solo los parámetros recibidos.
    expect(costoHistorico).toBeCloseTo(1_016_316, 2)
    expect(costoNuevo).toBeCloseTo(1_126_188, 2)   // 327 × 0.42 × 8200
    expect(costoHistorico).not.toBe(costoNuevo)
  })
})

// ---------------------------------------------------------------------------
// calculateTripsRequired
// ---------------------------------------------------------------------------

describe('calculateTripsRequired', () => {
  it('N < C → 1 viaje (30 cabezas, capacidad 40)', () => {
    expect(calculateTripsRequired(30, 40)).toBe(1)
  })

  it('N = C → 1 viaje (exactamente lleno, sin alerta)', () => {
    expect(calculateTripsRequired(40, 40)).toBe(1)
  })

  it('N > C múltiplo exacto → viajes sin resto (60 cabezas, capacidad 30)', () => {
    expect(calculateTripsRequired(60, 30)).toBe(2)
  })

  it('N > C no múltiplo → redondea hacia arriba (60 cabezas, capacidad 40)', () => {
    // ceil(60/40) = ceil(1.5) = 2
    expect(calculateTripsRequired(60, 40)).toBe(2)
  })

  it('N > C no múltiplo con resto mayor (90 cabezas, capacidad 40)', () => {
    // ceil(90/40) = ceil(2.25) = 3
    expect(calculateTripsRequired(90, 40)).toBe(3)
  })

  it('caso seed R3: 60 cabezas, capacidad ABCD 123 (40) → 2 viajes', () => {
    expect(calculateTripsRequired(60, 40)).toBe(2)
  })

  it('caso seed R3: 60 cabezas, capacidad IJKL 789 (55) → 2 viajes', () => {
    // ceil(60/55) = ceil(1.09…) = 2
    expect(calculateTripsRequired(60, 55)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// calculatePricing (función combinada)
// ---------------------------------------------------------------------------

describe('calculatePricing', () => {
  it('N < C: un viaje, costo sin multiplicar', () => {
    const result = calculatePricing({
      distanceKm: 327,
      consumptionLPerKm: 0.42,
      fuelPricePerLiter: 7400,
      headCount: 35,
      truckCapacity: 40,
    })
    expect(result.tripsRequired).toBe(1)
    expect(result.fuelCostPerTrip).toBeCloseTo(1_016_316, 2)
    expect(result.totalFuelCost).toBeCloseTo(1_016_316, 2)
  })

  it('N = C: un viaje, sin alerta de capacidad', () => {
    const result = calculatePricing({
      distanceKm: 327,
      consumptionLPerKm: 0.42,
      fuelPricePerLiter: 7400,
      headCount: 40,
      truckCapacity: 40,
    })
    expect(result.tripsRequired).toBe(1)
    expect(result.totalFuelCost).toBeCloseTo(result.fuelCostPerTrip, 2)
  })

  it('N > C múltiplo: costo total = costo por viaje × viajes necesarios', () => {
    // Caso seed R3: 60 cabezas, 418 km, camión 30 cap / 0.420 L/km, precio 7400
    const result = calculatePricing({
      distanceKm: 418,
      consumptionLPerKm: 0.42,
      fuelPricePerLiter: 7400,
      headCount: 60,
      truckCapacity: 30,
    })
    // trips = 2; costo por viaje = 418 × 0.42 × 7400 = 1.299.144; total = 2.598.288
    expect(result.tripsRequired).toBe(2)
    expect(result.fuelCostPerTrip).toBeCloseTo(1_299_144, 2)
    expect(result.totalFuelCost).toBeCloseTo(2_598_288, 2)
  })

  it('N > C no múltiplo: trips redondeado hacia arriba', () => {
    // 60 cabezas, capacidad 40 → 2 viajes
    const result = calculatePricing({
      distanceKm: 418,
      consumptionLPerKm: 0.42,
      fuelPricePerLiter: 7400,
      headCount: 60,
      truckCapacity: 40,
    })
    expect(result.tripsRequired).toBe(2)
    expect(result.totalFuelCost).toBeCloseTo(result.fuelCostPerTrip * 2, 2)
  })

  it('el total es siempre fuelCostPerTrip × tripsRequired', () => {
    const inputs = [
      { headCount: 15, truckCapacity: 40 },
      { headCount: 40, truckCapacity: 40 },
      { headCount: 55, truckCapacity: 40 },
      { headCount: 90, truckCapacity: 40 },
    ]
    inputs.forEach(({ headCount, truckCapacity }) => {
      const r = calculatePricing({
        distanceKm: 200,
        consumptionLPerKm: 0.45,
        fuelPricePerLiter: 7400,
        headCount,
        truckCapacity,
      })
      expect(r.totalFuelCost).toBeCloseTo(r.fuelCostPerTrip * r.tripsRequired, 5)
    })
  })
})
