import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshButton({ socket }: { socket: any }) {
    const [showRefresh, setShowRefresh] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowRefresh(true);
        }, 15000); // Show after 15s

        return () => clearTimeout(timer);
    }, []);

    if (!showRefresh) return null;

    return (
        <button
            onClick={() => {
                socket.emit("refresh_qr");
                setShowRefresh(false);
            }}
            className="mt-4 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
        >
            <RefreshCw className="w-3 h-3" />
            Taking too long? Refresh
        </button>
    );
}
