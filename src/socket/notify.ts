import { getIO } from './socket';


export function notifyRoomsUpdated(): void {
  try {
    getIO().emit('rooms:updated');
  } catch {
    
  }
}
