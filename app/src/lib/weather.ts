/** Current temperature for the weather chip. Open-Meteo needs no API key. */
export interface Weather {
  tempF: number;
  code: number;
}

export const DEFAULT_LOCATION = { lat: 40.748, lon: -73.981, name: "New York, NY" };

export async function fetchWeather(lat = DEFAULT_LOCATION.lat, lon = DEFAULT_LOCATION.lon): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { temperature_2m: number; weather_code: number } };
    if (!j.current) return null;
    return { tempF: j.current.temperature_2m, code: j.current.weather_code };
  } catch {
    return null;
  }
}
