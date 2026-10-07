import { useState, useEffect } from 'react';
import { FiWind, FiTool, FiThermometer, FiSettings } from 'react-icons/fi';
import { listServices } from '../services/serviceCatalogService';

const ICON_MAP = {
  FiWind: <FiWind />,
  FiTool: <FiTool />,
  FiThermometer: <FiThermometer />,
  FiSettings: <FiSettings />,
};

export function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listServices()
      .then((data) => {
        const mapped = data.map((s) => ({
          id: s._id,
          label: s.name,
          desc: s.description,
          price: s.price,
          icon: ICON_MAP[s.icon] || <FiSettings />,
          serviceType: s.serviceType,
          unitTypePricing: s.unitTypePricing || [],
          hiddenFromDirectSelection: !!s.hiddenFromDirectSelection,
        }));
        setServices(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { services, loading };
}
