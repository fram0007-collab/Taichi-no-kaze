from abc import ABC, abstractmethod

class TrafficClient(ABC):
    """
    Abstract Base Class defining the unified contract for traffic providers.
    """
    @abstractmethod
    def get_flow_data(self, zone_name: str, baseline_speed: float, latitude: float, longitude: float, db=None) -> dict:
        """
        Retrieves real-time traffic flow parameters for a given location geofence.
        
        Returns:
            dict: Standardized payload shape:
                {
                    "current_speed": float,
                    "travel_delay": float,
                    "congestion_index": float,
                    "provider": str  # 'tomtom', 'google', or 'simulated'
                }
        """
        pass
