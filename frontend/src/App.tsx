import ArtCanvas from './components/ArtCanvas'
import Sidebar from './components/Sidebar'
import ShareBar from './components/ShareBar'

export default function App() {
  return (
    <div className="flex w-full h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <ShareBar />
        <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-auto p-6">
          <ArtCanvas />
        </div>
      </div>
      <Sidebar />
    </div>
  )
}
