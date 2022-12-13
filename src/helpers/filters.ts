import { AirTempData, LooseObject, WindTempData } from "types";
import moment from 'moment';
export const filterPredictions = (items: Array<AirTempData>) => {
  let result: { date: object, high: string, low: string }[] = [];
  const grupped = groupByDate(items);
  const keys = Object.keys(grupped);
  keys.map((key) => {
    const date = moment(key);
    const highest = grupped[key].reduce((prev: { v: number; }, cur: { v: number; }) => (cur.v > prev.v ? cur : prev));
    const lowest = grupped[key].reduce((prev: { v: number; }, cur: { v: number; }) => (cur.v < prev.v ? cur : prev));

    result.push({
      date: date,
      high: highest,
      low: lowest
    })
  });

  return result;
}

export const windPredictions = (items: Array<WindTempData>) => {
  let result: { date: object, high: string, low: string }[] = [];
  const grupped = groupWindByDate(items);
  const keys = Object.keys(grupped);
  keys.map((key) => {
    const date = moment(key);
    const highest = grupped[key].reduce((prev: { s: number; }, cur: { s: number; }) => (cur.s > prev.s ? cur : prev));
    const lowest = grupped[key].reduce((prev: { s: number; }, cur: { s: number; }) => (cur.s < prev.s ? cur : prev));

    result.push({
      date: date,
      high: highest,
      low: lowest
    })
  });

  return result;
}


function groupWindByDate(items: Array<WindTempData>) {
  let data: LooseObject = [];

  items.forEach((item) => {
    const itemDate = moment(item.t).format('YYYY-MM-DD');
    if (!data[itemDate]) {
      data[itemDate] = [];
      data[itemDate].push(item)
    } else {
      data[itemDate].push(item);
    }
  });

  return data;
}

function groupByDate(items: Array<AirTempData>) {
  let data: LooseObject = [];

  items.forEach((item) => {
    const itemDate = moment(item.t).format('YYYY-MM-DD');
    if (!data[itemDate]) {
      data[itemDate] = [];
      data[itemDate].push(item)
    } else {
      data[itemDate].push(item);
    }
  });

  return data;
}

