const fs = require('fs');
let code = fs.readFileSync('src/pages/CheckIn.tsx', 'utf-8');

// Update Success Location Details
const successLocationOld = `{locationDetails.distance !== undefined && (
                            <p className="text-sm text-slate-700 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}`;
const successLocationNew = `{locationDetails.distance !== undefined && (
                            <p className="text-sm text-slate-700 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}
                          {locationDetails.accuracy !== undefined && (
                            <p className="text-sm text-slate-700 flex justify-between items-center mb-3">
                              <span>Sai số GPS (Độ chính xác):</span> 
                              <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm">{Math.round(locationDetails.accuracy)} mét</span>
                            </p>
                          )}`;

code = code.replace(successLocationOld, successLocationNew);

// Update Error Location Details
const errorLocationOld = `{locationDetails.distance !== undefined && (
                            <p className="text-sm text-red-900 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold bg-white/80 px-2 py-1 rounded-md shadow-sm border border-red-100">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}`;
const errorLocationNew = `{locationDetails.distance !== undefined && (
                            <p className="text-sm text-red-900 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold bg-white/80 px-2 py-1 rounded-md shadow-sm border border-red-100">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}
                          {locationDetails.accuracy !== undefined && (
                            <p className="text-sm text-red-900 flex justify-between items-center mb-3">
                              <span>Sai số GPS (Độ chính xác):</span> 
                              <span className="font-bold bg-white/80 px-2 py-1 rounded-md shadow-sm border border-red-100">{Math.round(locationDetails.accuracy)} mét</span>
                            </p>
                          )}`;

code = code.replace(errorLocationOld, errorLocationNew);

fs.writeFileSync('src/pages/CheckIn.tsx', code);
console.log("Updated UI for CheckIn");
