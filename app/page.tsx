import CanvasClient from "./_components/CanvasClient";

// Unit 0 skeleton: a thin server shell rendering the client WebGPU canvas
// island. Build-time city-model loading (loadCityModel, the road network, the
// slim client payload) returns in Unit 1 when there is geometry to draw.
export default function Page() {
  return <CanvasClient />;
}
