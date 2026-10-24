import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { installStorage, fetchSession, logout } from "./api-storage.js";

function Root() {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    fetchSession().then((u) => {
      if (u) installStorage();
      setUser(u);
    });
  }, []);

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#8a8377" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onLogin={(u) => {
          installStorage();
          setUser(u);
        }}
      />
    );
  }

  return (
    <App
      currentUser={user}
      onLogout={async () => {
        await logout();
        setUser(null);
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
