import { Layout } from "./components/Layout";
import { useWebSocket } from "./hooks/useWebSocket";

/**
 * 应用根组件
 * 初始化 WebSocket 连接并渲染 Dashboard 布局
 */
function App(): React.ReactElement {
  useWebSocket();

  return <Layout />;
}

export default App;
