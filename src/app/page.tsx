"use client";

import { useState } from "react";
import { useSocket } from "@/lib/socket";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { BulkSender } from "@/components/BulkSender";
import { ContactsManager } from "@/components/ContactsManager";
import { Settings } from "@/components/Settings";
import { MessageSquare, Users, Settings as SettingsIcon, LogOut, LayoutDashboard } from "lucide-react";

export default function Home() {
  const { socket, isConnected } = useSocket();
  const [activeTab, setActiveTab] = useState<"dashboard" | "contacts" | "settings">("dashboard");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            W
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            WApp Manager
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "dashboard" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "contacts" ? "bg-purple-50 text-purple-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Users className="w-5 h-5" />
            Contacts
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "settings" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <SettingsIcon className="w-5 h-5" />
            Settings
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-2 text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
            {isConnected ? "Socket Connected" : "Disconnected"}
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
                  <h2 className="text-lg font-semibold text-gray-800">Connection Status</h2>
                  <QRCodeDisplay socket={socket} />
                </div>

                {/* Stats or Info */}
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                  <h3 className="text-lg font-semibold mb-2">Welcome Back!</h3>
                  <p className="text-blue-100 mb-6">Start your bulk messaging campaign easily. Remember to keep delays reasonable.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-blue-100">Messages Sent</div>
                    </div>
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-blue-100">Contacts</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bulk Sender */}
              <div className="pt-8 border-t border-gray-200">
                <BulkSender />
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
