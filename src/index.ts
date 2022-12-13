


import axios, { AxiosResponse } from "axios";
import moment from "moment";
import suncalc from "suncalc";
import { filterPredictions, windPredictions } from './helpers/filters';
import {
  Params,
  TimeZones,
  Products,
  Datum,
  Units,
  Symbols,
  UnitSymbols,
  FormattedReturnData,
  StationMetadata,
  RawReturnData,
  ReturnData,
  FormattedWindReturnData,
  RawWindReturnData,
  MoonPhases,
  Sunlight,
  Moonlight,
  Projects,
} from "./types";


/**
 * @typedef StandardReturnValues
 * @property time - timestamp of data point taken
 * @property rawValue - raw value of data point
 * @property value - value of data point with symbol based on unit of measure
 */

// round a number to the nearest hundredth
const round = (num: string | number): number => {
  const value = typeof num === "string" ? Number(num) : num;

  if (Number.isInteger(value)) {
    return value;
  }

  const numDecimalPlaces = (value.toString().split(".")[1] || []).length;

  if (numDecimalPlaces < 3) {
    return value;
  }

  const multiplier = Math.pow(10, 2);

  return Math.round(value * multiplier) / multiplier;
};

// converts today to 'yyyymmdd' for use in begin_date and end_date params
const now: string = new Date()
  .toISOString()
  .substr(0, 10)
  .replace(/\-/g, "");

/**
 * unitSymbols - symbols for a given unit of of measurement, based off of imperial or metric system
 *
 * @param system - system of measurement to use (imperial or metric)
 */
const unitSymbols = (system: string): UnitSymbols => {
  const isImperial = system === Units.IMPERIAL;

  return {
    degree: isImperial ? "° F" : "° C",
    height: isImperial ? " ft" : " m",
    speed: isImperial ? " kts" : " m/s",
    pressure: " mb",
  };
};

/**
 * get - call the tidescurrents API with a given station ID and params
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param params - params to grab specific data (available params: https://api.tidesandcurrents.noaa.gov/api/prod)
 */
const get = async (
  stationId: number | string,
  params: Params
): Promise<AxiosResponse> => {
  const { format, time_zone, ...rest } = params;

  return axios.get(`${Projects.TIDE}/api/datagetter`, {
    params: {
      station: stationId,
      format: format ?? "json",
      time_zone: time_zone ?? TimeZones.LDT,
      ...rest,
    },
  });
};

/**
 * tidePredictions - return tide predictions for a given date (defaults to today)
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param params - params to grab specific data (available params: https://api.tidesandcurrents.noaa.gov/api/prod)
 *
 * @returns {Array.<{time: string, rawValue: number, value: string, type: string}>} an array of tide prediction values (time, value, type [high or low])
 */
const tidePredictions = (
  stationId: number | string,
  units: string,
  date?: string
): Promise<FormattedReturnData[]> => {
  return get(stationId, {
    product: Products.TIDE_PREDICTIONS,
    date: date ?? "today",
    datum: Datum.MLLW,
    interval: "hilo",
    units,
  }).then(res => {
    if (!res || !res.data) {
      throw new Error("Something went wrong.");
    }

    const symbol = unitSymbols(units);

    return res.data?.predictions?.map((prediction: RawReturnData) => ({
      time: prediction.t,
      rawValue: prediction.v,
      value: `${prediction.v}${symbol.height}`,
      type: prediction.type,
    }));
  });
};

/**
 * stationMetadata - gets station metadata (id, name, location) for a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 *
 * @typedef {Object} StationMetadata
 * @property {string} id - the station ID
 * @property {string} name - the station name
 * @property {state} state - the state that the station is in
 * @property {number} latitude - latitude of the station
 * @property {number} longitude - longitude of the station
 * @property {number} latitudeDelta - latitude delta of station (for use with Apple Maps)
 * @property {number} longitudeDelta - longitude delta of station (for use with Apple Maps)
 *
 * @returns {StationMetadata}
 */
const stationMetadata = (
  stationId: number | string
): Promise<StationMetadata> => {
  return axios
    .get(
      `${Projects.TIDE}/mdapi/prod/webapi/stations/${stationId}.json`,
      {
        params: {
          expand: "details",
        },
      }
    )
    .then(res => {
      if (!res || !res.data) {
        throw new Error("Something went wrong.");
      }

      if (!res.data.stations) {
        return {
          id: stationId,
          name: null,
          state: null,
          latitude: null,
          longitude: null,
        };
      }

      const { name, state, lat, lng } = res.data.stations[0];

      return {
        id: stationId,
        name,
        state,
        latitude: lat,
        longitude: lng,
      };
    });
};

/**
 * getCurrentProductValue -  helper to get current product values that have the same API call structure and return params
 *
 * @param product - data product to return
 * @param stationId - ID of a given station
 * @param measurement - measurement symbol type
 * @param units - unit of measurement system
 * @param datum - datum type (for water levels)
 *
 * @returns {StandardReturnValues}
 */
const getCurrentProductValue = (
  product: string,
  stationId: number | string,
  measurement: string,
  units: string,
  datum?: string
): Promise<FormattedReturnData> => {
  const baseParams = {
    product,
    date: "latest",
    units: units,
  };
  const params = datum
    ? {
      ...baseParams,
      datum,
    }
    : baseParams;

  return get(stationId, params).then((res: AxiosResponse<ReturnData>) => {
    if (!res || !res.data) {
      throw new Error("Something went wrong.");
    }

    if (!res.data.data || !Array.isArray(res.data.data)) {
      return {
        time: null,
        rawValue: null,
        value: null,
      };
    }

    const { t, v } = res.data.data[0];
    const symbol = unitSymbols(units);

    return {
      time: t,
      rawValue: `${round(v)}`,
      /// @ts-ignore
      value: `${round(v)}${symbol[measurement]}`,
    };
  });
};

/**
 * currentWaterLevel - get the current water level (as average lowest tide recorded) for a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param units - unit of measurement system to use (metric or imperial)
 *
 * @returns {StandardReturnValues}
 */
const currentWaterLevel = (
  stationId: number | string,
  units: string
): Promise<FormattedReturnData> =>
  getCurrentProductValue(
    Products.WATER_LEVEL,
    stationId,
    Symbols.HEIGHT,
    units,
    Datum.MLLW
  );

/**
 * currentAirTemp - get the current air temperature for a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param units - unit of measurement system to use (metric or imperial)
 *
 * @returns {StandardReturnValues}
 */
const currentAirTemp = (
  stationId: number | string,
  units: string
): Promise<FormattedReturnData> =>
  getCurrentProductValue(Products.AIR_TEMP, stationId, Symbols.DEGREE, units);

/**
 * currentWaterTemp - get the current water temperature for a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param units - unit of measurement system to use (metric or imperial)
 *
 * @returns {StandardReturnValues}
 */
const currentWaterTemp = (
  stationId: number | string,
  units: string
): Promise<FormattedReturnData> =>
  getCurrentProductValue(Products.WATER_TEMP, stationId, Symbols.DEGREE, units);

/**
 * currentAirPressure - get the current air pressure at a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param units - unit of measurement system to use (metric or imperial)
 *
 * @returns {StandardReturnValues}
 */
const currentAirPressure = (
  stationId: number | string,
  units: string
): Promise<FormattedReturnData> =>
  getCurrentProductValue(
    Products.AIR_PRESSURE,
    stationId,
    Symbols.PRESSURE,
    units
  );

/**
 * currentWind - get the current wind info from a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param units - unit of measurement system to use (metric or imperial)
 *
 * @typedef {Object} WindParams
 * @property {string} time - timestamp of value
 * @property {number} rawSpeed - raw speed value
 * @property {string} speed - speed measurement with symbol based on measurement system
 * @property {number} rawGust - raw gust value
 * @property {string} gust - gust measurement with symbol based on measurement system
 * @property {string} direction - wind direction
 *
 * @returns {WindParams}
 */
const currentWind = (
  stationId: number | string,
  units: string
): Promise<FormattedWindReturnData> => {
  return get(stationId, {
    product: Products.WIND,
    date: "latest",
    units,
  }).then((res: AxiosResponse<RawWindReturnData>) => {
    if (!res || !res.data) {
      throw new Error("Something went wrong.");
    }

    if (!res.data.data || !Array.isArray(res.data.data)) {
      return {
        time: null,
        rawSpeed: null,
        speed: null,
        rawGust: null,
        gust: null,
        direction: null,
      };
    }

    const { t, s, g, dr } = res.data.data[0];
    const symbol = unitSymbols(units);

    return {
      time: t,
      rawSpeed: s,
      speed: `${s} ${symbol.speed}`,
      rawGust: g,
      gust: `${g} ${symbol.speed}`,
      direction: dr,
    };
  });
};

/**
 * moonPhase - get the moon phase for a given date (defaults to today)
 *
 * @param date - date to get the moon phase
 *
 * @typedef {Object} MoonPhase
 * @property {string} emoji - moon emoji for a given phase
 * @property {string} phase - name of moon phase
 *
 * @returns {MoonPhase}
 */
const moonPhase = (
  date: Date = new Date(Date.now())
): { emoji: string; phase: string, value: number } => {
  const { phase } = suncalc.getMoonIllumination(date);

  const newPhase = phase >= 0 && phase <= 0.125;
  const waxCres = phase >= 0.125 && phase < 0.25;
  const quarCres = phase >= 0.25 && phase < 0.375;
  const waxGibb = phase >= 0.375 && phase < 0.5;
  const full = phase >= 0.5 && phase < 0.625;
  const wanGibb = phase >= 0.625 && phase < 0.75;
  const lastQuar = phase >= 0.75 && phase < 0.875;
  const wanCres = phase >= 0.875 && phase <= 1.0;

  if (newPhase) {
    return {
      emoji: "🌑",
      phase: MoonPhases.NEW,
      value: phase
    };
  } else if (waxCres) {
    return {
      emoji: "🌒",
      phase: MoonPhases.WAX_CRES,
      value: phase
    };
  } else if (quarCres) {
    return {
      emoji: "🌓",
      phase: MoonPhases.QUAR_CRES,
      value: phase
    };
  } else if (waxGibb) {
    return {
      emoji: "🌔",
      phase: MoonPhases.WAX_GIBB,
      value: phase
    };
  } else if (full) {
    return {
      emoji: "🌕",
      phase: MoonPhases.FULL,
      value: phase
    };
  } else if (wanGibb) {
    return {
      emoji: "🌖",
      phase: MoonPhases.WAN_GIBB,
      value: phase
    };
  } else if (lastQuar) {
    return {
      emoji: "🌗",
      phase: MoonPhases.LAST_QUAR,
      value: phase
    };
  } else if (wanCres) {
    return {
      emoji: "🌘",
      phase: MoonPhases.WAN_CRES,
      value: phase
    };
  }

  return {
    emoji: "",
    phase: "",
    value: 0,
  };
};

/**
 * moonlight - get moon rise/set times for a given day
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param date - date to get the moon phase
 *
 * @typedef {Object} Moonlight
 * @property {Date} rise - moonrise date/time
 * @property {Date} set -moon set date/time
 * @property {boolean} alwaysUp - if the sun is always above the horizon
 * @property {boolean} alwaysDown - if the sun is always below the horizon
 *
 * @returns {Moonlight}
 */
const moonlight = async (
  stationId: number | string,
  date: Date = new Date(Date.now())
): Promise<Moonlight> => {
  const { latitude, longitude } = await stationMetadata(stationId);

  if (!latitude || !longitude) {
    return {
      rise: null,
      set: null,
    };
  }

  return suncalc.getMoonTimes(date, latitude, longitude);
};


/**
 * moonlight - get moon rise/set times for a given day
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param date - date to get the moon phase
 *
 * @typedef {Object} Moonlight
 * @property {Date} rise - moonrise date/time
 * @property {Date} set -moon set date/time
 * @property {boolean} alwaysUp - if the sun is always above the horizon
 * @property {boolean} alwaysDown - if the sun is always below the horizon
 *
 * @returns {Moonlight}
 */
const getMoonlightWithCoordinates = async (
  lat: number,
  lng: number,
  date: Date = new Date(Date.now())
): Promise<Moonlight> => {

  if (!lat || !lng) {
    return {
      rise: null,
      set: null,
    };
  }

  return suncalc.getMoonTimes(date, lat, lng);
};

/**
 * getSunlight - get sun times for a given day at a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param date - date to get the moon phase
 */
const sunlight = async (
  stationId: number | string,
  date: Date = new Date(Date.now())
): Promise<Sunlight> => {
  const { latitude, longitude } = await stationMetadata(stationId);

  if (!latitude || !longitude) {
    return {
      sunrise: null,
      sunriseEnd: null,
      goldenHourEnd: null,
      solarNoon: null,
      sunsetStart: null,
      sunset: null,
      dusk: null,
      nauticalDusk: null,
      night: null,
      nadir: null,
      nightEnd: null,
      nauticalDawn: null,
      dawn: null,
    };
  }

  return suncalc.getTimes(date, latitude, longitude);
};


/**
 * getSunlight - get sun times for a given day at a given station
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 * @param date - date to get the moon phase
 */
const getSunlightWithCoordinates = async (
  lat: number,
  lng: number,
  date: Date = new Date(Date.now())
): Promise<Sunlight> => {

  if (!lat || !lng) {
    return {
      sunrise: null,
      sunriseEnd: null,
      goldenHourEnd: null,
      solarNoon: null,
      sunsetStart: null,
      sunset: null,
      dusk: null,
      nauticalDusk: null,
      night: null,
      nadir: null,
      nightEnd: null,
      nauticalDawn: null,
      dawn: null,
    };
  }

  return suncalc.getTimes(date, lat, lng);
};


/**
 * extremes
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 */
const extremes = (
  stationId: number | string,
  startDate: string,
  endDate: string,
  datum: string | 'MSL',
  units: string | 'metric'
) => {
  return axios
    .get(`${Projects.TIDE}/api/prod/datagetter?begin_date=${startDate}&end_date=${endDate}&station=${stationId}&product=predictions&datum=${datum}&time_zone=lst_ldt&interval=hilo&units=${units}&application=DataAPI_Sample&format=json`)
    .then(res => {
      if (!res || !res.data) {
        throw new Error("Something went wrong.");
      }

      const predictions = res.data.predictions;
      return predictions;
    });
};


/**
 * extremes
 *
 * @param stationId - ID of a station to get data for (station IDs can be found here: https://tidesandcurrents.noaa.gov/stations.html)
 */
const getCurrentExtremes = (
  stationId: number | string,
  datum: string | 'MSL',
  units: string | 'metric'
) => {
  try {
    const date = moment().format('YYYYMMDD');
    return axios
      .get(`${Projects.TIDE}/api/prod/datagetter?begin_date=${date}&end_date=${date}&station=${stationId}&product=predictions&datum=${datum}&time_zone=lst_ldt&interval=hilo&units=${units}&application=DataAPI_Sample&format=json`)
      .then(res => {
        if (!res || !res.data) {
          throw new Error("Something went wrong.");
        }

        const predictions = res.data.predictions;
        return predictions;
      }).catch(() => {
        return [];
      });
  } catch (error) {
    return [];
  }

};


const predictions = (
  stationId: number | string,
  startDate: string,
  endDate: string,
  datum: string
) => {
  return axios

    .get(`${Projects.TIDE}/api/prod/datagetter?begin_date=${startDate}&end_date=${endDate}&station=${stationId}&product=predictions&datum=${datum}&time_zone=GMT&units=metric&application=DataAPI_Sample&format=json&interval=h`)
    .then(res => {
      if (!res || !res.data) {
        throw new Error("Something went wrong.");
      }
      console.log(res)
      const predictions = res.data.predictions;
      return predictions;
    });
};


const getWeatherHiLo = async (
  stationId: number | string,
  startDate: string,
  endDate: string,
  datum: string | 'MSL',
  units: string | 'metric'
) => {
  const airTemp = await axios.get(`${Projects.TIDE}/api/prod/datagetter?application=DataAPI_Sample&begin_date=${startDate}&datum=${datum}&end_date=${endDate}&station=${stationId}&time_zone=gmt&units=${units}&format=json&product=air_temperature&interval=h`);
  const filteredAitTemp = filterPredictions(airTemp?.data?.data);

  const watherTemp = await axios.get(`${Projects.TIDE}/api/prod/datagetter?application=DataAPI_Sample&begin_date=${startDate}&datum=${datum}&end_date=${endDate}&station=${stationId}&time_zone=gmt&units=${units}&format=json&product=water_temperature&interval=h`);
  const filterWatherTemp = filterPredictions(watherTemp?.data?.data);

  const wind = await axios.get(`${Projects.TIDE}/api/prod/datagetter?application=DataAPI_Sample&begin_date=${startDate}&datum=${datum}&end_date=${endDate}&station=${stationId}&time_zone=gmt&units=${units}&format=json&product=wind&interval=h`);
  const filterWind = windPredictions(wind?.data?.data);

  const pressure = await axios.get(`${Projects.TIDE}/api/prod/datagetter?application=DataAPI_Sample&begin_date=${startDate}&datum=${datum}&end_date=${endDate}&station=${stationId}&time_zone=gmt&units=${units}&format=json&product=air_pressure&interval=h`);
  const filterPressure = filterPredictions(pressure?.data?.data);

  return {
    airTemp: filteredAitTemp,
    watherTemp: filterWatherTemp,
    wind: filterWind,
    pressure: filterPressure
  };
};

const astrology = async (
  lat: string,
  lng: string,
  date: string,
) => {
  const curDate = date ? date : 'today';
  const astrology = await axios.get(`${Projects.SS}/json?lat=${lat}&lng=${lng}&date=${curDate}`);
  return {
    data: astrology?.data?.results
  };
};



export default {
  get,
  tidePredictions,
  stationMetadata,
  currentWaterLevel,
  currentAirPressure,
  currentAirTemp,
  currentWaterTemp,
  currentWind,
  moonPhase,
  moonlight,
  sunlight,
  now,
  extremes,
  predictions,
  getWeatherHiLo,
  astrology,
  getMoonlightWithCoordinates,
  getSunlightWithCoordinates,
  getCurrentExtremes
};
