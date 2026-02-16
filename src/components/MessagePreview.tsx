import { FileText } from "lucide-react";

interface MessagePreviewProps {
    message: string;
    attachments?: {
        filename: string;
        mimetype: string;
        data: string; // Base64
    }[];
}

export function MessagePreview({ message, attachments = [] }: MessagePreviewProps) {
    // Current time for the fake timestamp
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="w-full max-w-sm mx-auto bg-[#efeae2] p-4 rounded-lg shadow-inner min-h-[300px] flex flex-col"
            style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" }}>

            <div className="flex-1"></div>

            <div className="bg-[#d9fdd3] p-2 rounded-lg rounded-tr-none self-end max-w-[85%] shadow-sm relative mb-2">

                {/* Attachments Preview */}
                {attachments.map((att, i) => (
                    <div key={i} className="mb-2">
                        {att.mimetype.startsWith("image/") ? (
                            <div className="rounded overflow-hidden mb-1 border border-black/10">
                                <img
                                    src={`data:${att.mimetype};base64,${att.data}`}
                                    alt={att.filename}
                                    className="w-full h-auto object-cover max-h-[200px]"
                                />
                            </div>
                        ) : (
                            <div className="bg-white/50 p-2 rounded flex items-center gap-2 text-sm text-gray-700">
                                <FileText className="w-4 h-4 text-gray-500" />
                                <span className="truncate">{att.filename}</span>
                            </div>
                        )}
                    </div>
                ))}

                {/* Message Text */}
                <p className="text-gray-800 text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {message || <span className="text-gray-400 italic">Type a message...</span>}
                </p>

                {/* Metadata */}
                <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-gray-500">{time}</span>
                    <span className="text-blue-500">
                        <svg viewBox="0 0 16 11" height="11" width="16" preserveAspectRatio="xMidYMid meet" version="1.1">
                            <path fill="currentColor" d="M11.55 1.55L7.225 9.775 4 6.55 5.55 5 7.225 6.675 10 1.55 11.55 1.55ZM16 1.55L11.675 9.775 8.45 6.55 10 5 11.675 6.675 14.45 1.55 16 1.55Z"></path>
                        </svg>
                    </span>
                </div>

                {/* Triangular Tip */}
                <div className="absolute top-0 -right-2 w-0 h-0 
                    border-t-[10px] border-t-[#d9fdd3]
                    border-r-[10px] border-r-transparent">
                </div>
            </div>
        </div>
    );
}
