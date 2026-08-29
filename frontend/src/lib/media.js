import { axiosInstance } from "./axios";

export async function refreshMessageMedia(messageId, type) {
  const response = await axiosInstance.get(`/messages/media/${messageId}/${type}`);
  return response.data;
}
