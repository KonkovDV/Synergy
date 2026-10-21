// Motorica Start game control, contract v1, for the example host (docs/embed/README.md, «Motorica Start»): the
// service Motorica Start offers its own game, Motorica Kart (github.com/HakerFromRussia-XD/1_game_stk —
// IGameControlService.aidl, IGameControlCallback.aidl, GameControlSnapshot.java, SuperTuxKartActivity.java).
// The binder calls are written out by hand — what the aidl tool generates from those files — so the host needs no
// extra build step. Motorica Start may let only its own games bind (permission CONTROL_GAME): bind() then says false.
package com.example.synergyhost

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Binder
import android.os.IBinder
import android.os.Parcel

/** One snapshot of Motorica Start: two levels 0…255 that Motorica Start computes, no gestures. */
data class MotoricaSnapshot(
    val version: Int, val seq: Long, val timestampMs: Long,
    val openLevel: Int, val closeLevel: Int, val connected: Boolean,
) {
    /** The shape window.Synergy.feed reads as is: close is channel A, open is B, seq and connected are kept. */
    fun toJson(): String =
        "{\"version\":$version,\"seq\":$seq,\"timestampMs\":$timestampMs,\"openLevel\":$openLevel,\"closeLevel\":$closeLevel,\"connected\":$connected}"

    companion object {
        /** Field order of GameControlSnapshot.writeToParcel. */
        fun read(p: Parcel) = MotoricaSnapshot(p.readInt(), p.readLong(), p.readLong(), p.readInt(), p.readInt(), p.readInt() != 0)
    }
}

/** Called on a binder thread: post to the UI thread before touching the WebView. */
class MotoricaStartLink(private val context: Context, private val onSnapshot: (MotoricaSnapshot) -> Unit) {
    private var service: IBinder? = null
    private var bound = false

    private val callback = object : Binder() {
        override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
            if (code == IBinder.INTERFACE_TRANSACTION) { reply?.writeString(CALLBACK); return true }
            if (code != ON_SNAPSHOT) return super.onTransact(code, data, reply, flags)
            data.enforceInterface(CALLBACK)
            if (data.readInt() != 0) onSnapshot(MotoricaSnapshot.read(data))
            reply?.writeNoException()
            return true
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = binder
            call(GET_LATEST, read = { if (it.readInt() != 0) onSnapshot(MotoricaSnapshot.read(it)) })
            call(REGISTER, write = { it.writeStrongBinder(callback) })
        }

        override fun onServiceDisconnected(name: ComponentName) {
            service = null
            // As Motorica Kart does: the game hears «not connected» at once instead of waiting for its watchdog.
            onSnapshot(MotoricaSnapshot(1, 0L, System.currentTimeMillis(), 0, 0, false))
        }
    }

    /** False: Motorica Start is not installed, or it does not let this app bind. The game keeps its other sources. */
    fun bind(): Boolean {
        if (bound) return true
        val intent = Intent(BIND_ACTION).setPackage(MOTORICA_START)
        bound = try { context.bindService(intent, connection, Context.BIND_AUTO_CREATE) } catch (e: SecurityException) { false }
        return bound
    }

    fun unbind() {
        call(UNREGISTER, write = { it.writeStrongBinder(callback) })
        if (bound) context.unbindService(connection)
        bound = false
        service = null
    }

    private fun call(code: Int, write: (Parcel) -> Unit = {}, read: (Parcel) -> Unit = {}) {
        val remote = service ?: return
        val data = Parcel.obtain()
        val reply = Parcel.obtain()
        try {
            data.writeInterfaceToken(SERVICE)
            write(data)
            remote.transact(code, data, reply, 0)
            reply.readException()
            read(reply)
        } catch (e: Exception) {
            // Motorica Start went away mid-call: onServiceDisconnected follows.
        } finally {
            reply.recycle()
            data.recycle()
        }
    }

    companion object {
        const val MOTORICA_START = "com.bailout.stickk"
        const val BIND_ACTION = "com.motorica.gamecontrol.BIND"
        private const val SERVICE = "com.motorica.gamecontrol.IGameControlService"
        private const val CALLBACK = "com.motorica.gamecontrol.IGameControlCallback"
        // Transaction codes follow the order of the methods in the .aidl files.
        private const val GET_LATEST = IBinder.FIRST_CALL_TRANSACTION
        private const val REGISTER = IBinder.FIRST_CALL_TRANSACTION + 1
        private const val UNREGISTER = IBinder.FIRST_CALL_TRANSACTION + 2
        private const val ON_SNAPSHOT = IBinder.FIRST_CALL_TRANSACTION
    }
}
