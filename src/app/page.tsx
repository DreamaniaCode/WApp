"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/lib/socket";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { BulkSender } from "@/components/BulkSender";
import { ContactsManager } from "@/components/ContactsManager";
import { Settings } from "@/components/Settings";
import { MessageSquare, Users, Settings as SettingsIcon, LogOut, LayoutDashboard, Globe, Smartphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";

export default function Home() {
  const { socket, isConnected } = useSocket();
  const [activeTab, setActiveTab] = useState<"dashboard" | "contacts" | "settings">("dashboard");
  const { t, language, setLanguage } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();

  // Pairing Code State
  const [showPairingCodeInput, setShowPairingCodeInput] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);


  const [stats, setStats] = useState({ success: 0, contacts: 0 });

  /* 
   * Updated to use API_URL from config and include credentials for CORS.
   * This fixes the 404 error by hitting the correct backend port (3001).
   */
  const fetchStats = async () => {
      try {
          // Use the full backend URL
          const res = await fetch(`${API_URL}/api/stats`, {
              headers: {
                  "Content-Type": "application/json",
              },
              // Critical for passing the HttpOnly cookie to the backend
              credentials: "include" 
          });
          
          if (res.ok) {
              const data = await res.json();
              setStats(data);
          } else {
              console.error("Failed to fetch stats:", res.status, res.statusText);
          }
      } catch (error) {
          console.error("Failed to fetch stats", error);
      }
  };

  useEffect(() => {
      fetchStats();
      const interval = setInterval(fetchStats, 10000); // Poll every 10s
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (socket) {
        socket.emit("status"); // Request current status on mount/connect

        socket.on("pairing_code", (data: { code: string }) => {
            console.log("Frontend: Pairing Code Received", data.code);
            setPairingCode(data.code);
        });

        socket.on("ready", () => {
            console.log("Frontend: Client ready, clearing pairing code");
            setPairingCode("");
            setShowPairingCodeInput(false);
            // Optionally set a specialized 'isWhatsAppReady' state here if you add one
        });

        socket.on("authenticated", () => {
             console.log("Frontend: Client authenticated");
             setPairingCode("");
             setShowPairingCodeInput(false);
             fetchStats(); // Refresh stats on connect
             // Show success message (simple alert for now, or a toast component if available)
             // utilizing a simple browser notification or state-based UI message
             const notification = new Notification("WhatsApp Connected Successfully!");
        });

        socket.on("error", (data: { message: string }) => {
            console.error("Frontend: Socket Error", data.message);
            alert("Error: " + data.message);
        });
        
        socket.on("bulk_progress", (data: any) => {
             // Refresh stats when bulk sending progresses
             if (data.status === "Completed" || data.current % 5 === 0) {
                 fetchStats();
             }
        });
    }
    return () => {
        if (socket) {
            socket.off("pairing_code");
            socket.off("ready");
            socket.off("authenticated");
            socket.off("error");
            socket.off("bulk_progress");
        }
    }
  }, [socket]);

  // Request notification permission on mount
  useEffect(() => {
      if (Notification.permission === "default") {
          Notification.requestPermission();
      }
  }, []);


  const toggleLanguage = () => {
    setLanguage(language === "en" ? "fr" : "en");
  };

  const requestPairingCode = () => {
      console.log("Requesting Pairing Code for:", phoneNumber);
      if (socket && phoneNumber) {
          console.log("Socket exists, emitting event...");
          socket.emit("request_pairing_code", { phoneNumber });
      } else {
          console.log("Socket or phoneNumber missing", { socket: !!socket, phoneNumber });
      }
  };

  if (status === "loading") {
      return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!session) {
      return null; 
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            W
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            {t("appName")}
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "dashboard" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            {t("dashboard")}
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "contacts" ? "bg-purple-50 text-purple-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Users className="w-5 h-5" />
            {t("contacts")}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "settings" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <SettingsIcon className="w-5 h-5" />
            {t("settings")}
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="px-4 py-2 text-sm font-medium text-gray-700">
                {session.user?.name || session.user?.email}
            </div>
            <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors"
            >
                <LogOut className="w-4 h-4" />
                Logout
            </button>
        
          <button
            onClick={toggleLanguage}
            className="w-full flex items-center gap-2 justify-center px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium transition-colors border border-gray-200"
          >
            <Globe className="w-4 h-4" />
            {language === "en" ? "Français" : "English"}
          </button>

          <div className="flex items-center gap-3 px-4 py-2 text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
            {isConnected ? t("whatsappReady") : t("disconnect")}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* QR Code Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">{t("scanQr")}</h2>
                    <button 
                        onClick={() => setShowPairingCodeInput(!showPairingCodeInput)}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                        <Smartphone className="w-4 h-4" />
                        {showPairingCodeInput ? "Use QR Code" : "Use Pairing Code"}
                    </button>
                  </div>
                  
                  {showPairingCodeInput ? (
                      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                          <h3 className="font-medium mb-4">Link with Phone Number</h3>
                          {!pairingCode ? (
                              <div className="space-y-3">
                                  <p className="text-sm text-gray-600">Enter your phone number to get a pairing code.</p>
                                  <input 
                                    type="text" 
                                    placeholder="+1234567890" 
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="w-full p-2 border rounded"
                                  />
                                  <button 
                                    onClick={requestPairingCode}
                                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                                    disabled={!phoneNumber}
                                  >
                                      Get Code
                                  </button>
                              </div>
                          ) : (
                              <div className="text-center space-y-4">
                                  <p className="text-sm text-gray-600">Enter this code on your WhatsApp:</p>
                                  <div className="text-4xl font-mono font-bold tracking-widest bg-gray-100 p-4 rounded">
                                      {pairingCode}
                                  </div>
                                  <button 
                                    onClick={() => setPairingCode("")}
                                    className="text-sm text-gray-500 hover:text-gray-700"
                                  >
                                      Try different number
                                  </button>
                              </div>
                          )}
                      </div>
                  ) : (
                    <QRCodeDisplay socket={socket} />
                  )}
                </div>

                {/* Stats or Info */}
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                  <h3 className="text-lg font-semibold mb-2">{t("campaignDetails")}</h3>
                  <p className="text-blue-100 mb-6">{t("whatsappReadyDesc")}</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-2xl font-bold">{stats.success}</div>
                      <div className="text-xs text-blue-100">{t("success")}</div>
                    </div>
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-2xl font-bold">{stats.contacts}</div>
                      <div className="text-xs text-blue-100">{t("contacts")}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bulk Sender */}
              <div className="pt-8 border-t border-gray-200">
                <BulkSender socket={socket} />
              </div>
            </>
          )}

          {activeTab === "contacts" && (
            <ContactsManager />
          )}

          {activeTab === "settings" && (
            <Settings />
          )}
        </div>
      </main>
    </div>
  );
}
