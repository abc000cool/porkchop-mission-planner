// Historical Earth→Mars missions for the plot overlay.
// Dates: actual launch and Mars arrival (orbit insertion or landing).

export interface HistoricalMission {
  name: string;
  launch: string; // ISO date
  arrival: string;
}

export const MARS_MISSIONS: HistoricalMission[] = [
  { name: 'Viking 1', launch: '1975-08-20', arrival: '1976-06-19' },
  { name: 'Viking 2', launch: '1975-09-09', arrival: '1976-08-07' },
  { name: 'Mars Pathfinder', launch: '1996-12-04', arrival: '1997-07-04' },
  { name: 'Mars Odyssey', launch: '2001-04-07', arrival: '2001-10-24' },
  { name: 'MER Spirit', launch: '2003-06-10', arrival: '2004-01-04' },
  { name: 'MER Opportunity', launch: '2003-07-08', arrival: '2004-01-25' },
  { name: 'MRO', launch: '2005-08-12', arrival: '2006-03-10' },
  { name: 'Phoenix', launch: '2007-08-04', arrival: '2008-05-25' },
  { name: 'MSL Curiosity', launch: '2011-11-26', arrival: '2012-08-06' },
  { name: 'MAVEN', launch: '2013-11-18', arrival: '2014-09-22' },
  { name: 'InSight', launch: '2018-05-05', arrival: '2018-11-26' },
  { name: 'Mars 2020 Perseverance', launch: '2020-07-30', arrival: '2021-02-18' },
];
