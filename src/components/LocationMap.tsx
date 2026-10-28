import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix the default icon issue in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icon for the center point (work location)
const workIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface LocationMapProps {
  centerLat: number;
  centerLng: number;
  radius: number;
  markerLat?: number;
  markerLng?: number;
}

// Component to handle map re-centering
const ChangeView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  map.setView(center);
  return null;
};

export const LocationMap: React.FC<LocationMapProps> = ({ centerLat, centerLng, radius, markerLat, markerLng }) => {
  const centerPosition: [number, number] = useMemo(() => [centerLat, centerLng], [centerLat, centerLng]);
  
  const userPosition: [number, number] | null = useMemo(() => {
    if (markerLat && markerLng) {
      return [markerLat, markerLng];
    }
    return null;
  }, [markerLat, markerLng]);

  return (
    <div style={{ height: '100%', width: '100%', borderRadius: '0.5rem', overflow: 'hidden' }}>
      <MapContainer 
        center={userPosition || centerPosition} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
      >
        <ChangeView center={userPosition || centerPosition} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Work Location Circle */}
        <Circle 
          center={centerPosition} 
          radius={radius}
          pathOptions={{
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            color: '#3b82f6',
            opacity: 0.8,
            weight: 2,
          }}
        />
        
        {/* Work Location Marker */}
        <Marker position={centerPosition} icon={workIcon} />

        {/* User Location Marker */}
        {userPosition && (
          <Marker position={userPosition} />
        )}
      </MapContainer>
    </div>
  );
};
