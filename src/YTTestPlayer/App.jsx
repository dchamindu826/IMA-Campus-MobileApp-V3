// App.jsx
// ?v=... thiyenawa nam mobile app ekata player eka witharak (EmbedPage), nathnam test page eka.
import VideoTestPage from "./VideoTestPage";
import EmbedPage from "./EmbedPage";

export default function App() {
  const isEmbed = new URLSearchParams(window.location.search).has("v");
  return isEmbed ? <EmbedPage /> : <VideoTestPage />;
}
